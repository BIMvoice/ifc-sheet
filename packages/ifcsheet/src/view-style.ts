/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The style of every face and line of a view (#34): whether it is drawn, its stroke colour, its pen in paper millimetres, its
 * dash and (a cut face) its fill. ONE function for every renderer: the web app's drafting view (`Drawing2DCanvas`), its sheets
 * and their PDF and DXF (`viewport-pens.ts`), the view's DXF, and the headless sheets of the command line (`sheet-graphic.ts`).
 *
 * The layers, each later one winning field by field:
 *
 *   1. the view's graphic override preset (`presetId`), including its property rules (`FireRating >= 60`): they read the
 *      element's properties through `propertiesOf`;
 *   2. the cut face's building material (`materialFill`, a fill only);
 *   3. the view's category graphics, its template's under them (the caller passes `resolveViewGraphics`'s result), and between
 *      the two the template's mapping (#31): its class rules, then its material rules (a material says a fill only). The template's
 *      own category graphics are the fallback for what is unmapped; the view's own category graphics beat the mapping;
 *   4. the element's phase (`phaseStyle`, the web app's; the command line draws no phases);
 *   5. the element's own override (#32), from `resolveElementGraphics`;
 *   6. a colour scheme's fill (#92), the strongest word on a face;
 *   7. a linked model drawn halftone (`ink`, the web app's), which only lightens what the layers above chose.
 *
 * Visibility is the element's (`elementShown`) and the single line's (`lineHidden`): the same answer `styledDrawing` gives when it
 * leaves an item out. The viewport's hidden layers hide drafting layers, not model items, and stay with the sheet.
 *
 * Every weight word (`heavy` … `hairline`) is turned into millimetres by ONE pen table (`PenTable`), with a pen for the cut and
 * a pen for the projection (what is seen beyond the cut). Hidden lines take the hidden pen and its dash, whatever else says.
 */

import { BUILT_IN_PRESETS, GraphicOverrideEngine, ifcTypeCriterion, type ElementData, type GraphicOverrideRule, type OverrideCriteria, type OverrideCriterion } from '@ifc-lite/drawing-2d';
import { elementShown, lineHidden, resolveElementGraphics, type ElementStyle } from './element-graphics.js';
import { VIEW_CATEGORY_CLASSES } from './view-templates.js';
import { itemRules } from './style-rules.js';
import type { CategoryGraphics, CategoryLineWeight, PhaseId, PhaseStyle, ResolvedViewGraphics, StyleRuleStyle, ViewGraphics } from './view-graphics-types.js';

/** A weight word as a pen pair: the cut line and the line seen beyond the cut, paper mm. */
export interface WeightPair {
  cut: number;
  projection: number;
}

/** The pens of a generated drawing, paper millimetres. */
export interface PenTable {
  /** The pens with no weight word: a cut line and a cut face's outline, a silhouette, any other line seen, a hidden line, a hatch. */
  pens: { cut: number; outline: number; seen: number; hidden: number; hatch: number };
  /** What a weight word (a category's, a preset rule's, a phase's, an element's) means as a pen. */
  weights: Record<CategoryLineWeight, WeightPair>;
  /** Hatch pen of a material's drawing settings. */
  materialHatch: Record<CategoryLineWeight, number>;
}

/**
 * The pen table, paper mm: the one the printed sheets have always used, so a sheet in the default style prints as it did. A weight
 * word draws the projection at half its cut (`heavy` 0.7 cut, 0.35 seen beyond). The drafting view took its weights from a table
 * of its own (`heavy` 0.5 … `hairline` 0.18, the same weight for cut and projection) before #34; it now draws with this one.
 */
export const PEN_TABLE: PenTable = {
  pens: { cut: 0.5, outline: 0.5, seen: 0.25, hidden: 0.18, hatch: 0.13 },
  weights: {
    heavy: { cut: 0.7, projection: 0.35 }, medium: { cut: 0.5, projection: 0.25 },
    light: { cut: 0.25, projection: 0.125 }, hairline: { cut: 0.13, projection: 0.065 },
  },
  materialHatch: { heavy: 0.35, medium: 0.25, light: 0.18, hairline: 0.13 },
};

/** A hidden line's dash, paper mm. */
export const HIDDEN_DASH_MM: readonly number[] = [1.5, 1];
/** A dashed line's dash (a dashed phase, an element drawn dashed), paper mm. */
export const DASH_MM: readonly number[] = [3, 1.5];
/** A cut face nothing gives a fill: light grey. */
export const DEFAULT_FACE_FILL = '#d4d4d8';
/** A line nothing gives a colour. */
export const DEFAULT_INK = '#000000';

/** The default graphic override preset: IFC material colours, no rules. */
export const DEFAULT_VIEW_PRESET = 'preset-3d-colors';

/** The rules of the view's preset (absent: the default; `null`: none). */
export function presetRules(graphics: ViewGraphics | undefined): GraphicOverrideRule[] {
  const id = graphics?.presetId === undefined ? DEFAULT_VIEW_PRESET : graphics.presetId;
  return id ? BUILT_IN_PRESETS.find((p) => p.id === id)?.rules ?? [] : [];
}

const CATEGORY_OF = new Map<string, string>(VIEW_CATEGORY_CLASSES.flatMap((c) => c.classes.map((k) => [k.toUpperCase(), c.id] as const)));

/** The view's override rules as one list: its preset's, then one rule per category it restyles (winning). */
export function viewOverrideRules(graphics: ViewGraphics | undefined): GraphicOverrideRule[] {
  const rules = [...presetRules(graphics)];
  for (const category of VIEW_CATEGORY_CLASSES) {
    const g: CategoryGraphics | undefined = graphics?.categories?.[category.id];
    if (!g || (!g.lineColor && !g.fillColor && !g.lineWeight)) continue;
    rules.push({
      id: `view-category-${category.id}`, name: category.id, enabled: true, priority: 100000, criteria: ifcTypeCriterion([...category.classes]),
      style: { ...(g.lineColor ? { strokeColor: g.lineColor } : {}), ...(g.fillColor ? { fillColor: g.fillColor } : {}), ...(g.lineWeight ? { lineWeight: g.lineWeight } : {}) },
    });
  }
  return rules;
}

const needsProperties = (c: OverrideCriterion | OverrideCriteria): boolean => ('logic' in c ? c.conditions.some(needsProperties) : c.type === 'property' || c.type === 'propertySet');

/** Whether any of `rules` reads an element's properties (only then is `propertiesOf` asked). */
export const rulesReadProperties = (rules: readonly GraphicOverrideRule[]): boolean => rules.some((r) => r.enabled && needsProperties(r.criteria));

/**
 * An element's property sets as the rules read them: by set name, a property's value by its name. Two sets of the same name (one
 * from the type, one from the occurrence) are merged, the earlier set winning a name both have.
 */
export function elementProperties(sets: readonly { name: string; properties: readonly { name: string; value: unknown }[] }[]): Record<string, Record<string, unknown>> {
  const bySet = new Map<string, Record<string, unknown>>();
  for (const set of sets) {
    let values = bySet.get(set.name);
    if (!values) bySet.set(set.name, (values = {}));
    for (const p of set.properties) if (!Object.hasOwn(values, p.name)) values[p.name] = p.value;
  }
  return Object.fromEntries(bySet);
}

/** What a renderer hands the styler: a face (`DrawingPolygon`) or a line (`DrawingLine`), with the marks `styledDrawing` adds. */
export interface StyleItem {
  entityId?: number;
  ifcType?: string;
  /** A line's kind (`cut`, `projection`, `silhouette`, `hidden`, …); a face has none. */
  category?: string;
  visibility?: string;
  /** A line's two ends (a face has `polygon` instead). */
  line?: { start: { x: number; y: number }; end: { x: number; y: number } };
  phase?: PhaseId;
  elementStyle?: ElementStyle;
  schemeColour?: string;
  /** The fill its building material gives a cut face (null: none, the paper shows). */
  materialFill?: string | null;
  /** The IfcMaterial a cut face is a band of (the drawing's `materialId`): what a template's material rules are matched on, through `materialOf`. */
  materialId?: number;
}

/** Which pen a line draws with. A cut face's outline is `cut`. */
export type PenKind = 'cut' | 'projection' | 'hidden';

export interface ItemStyle {
  visible: boolean;
  kind: PenKind;
  stroke: string;
  /** Paper millimetres. */
  weight: number;
  /** Paper millimetres; empty is solid. */
  dash: readonly number[];
  /** A face's fill; a line has none. */
  fill: string | null;
  /** The fill is a colour scheme's (#92): the DXF writes it as a solid hatch. */
  scheme: boolean;
}

export interface ViewStyleInputs {
  /** The view's graphics as `resolveViewGraphics` gives them (its template's, then its own). */
  graphics: ResolvedViewGraphics | undefined;
  /** Default: `PEN_TABLE`. A project's graphic standard brings its own. */
  pens?: PenTable;
  /** An element's properties, for the preset's property rules. */
  propertiesOf?: (entityId: number) => ElementData['properties'];
  /** An element's GlobalId: how the view's per-element graphics find it when the item is not marked already. */
  globalIdOf?: (entityId: number) => string | null | undefined;
  /** How a phase draws in this view (the web app's `phaseStyle`). */
  phaseStyle?: (phase: PhaseId) => PhaseStyle;
  /** The name of the IfcMaterial `materialId` of an element is: what a template's material rules match. Without it material rules say nothing. */
  materialOf?: (entityId: number, materialId: number) => string | null | undefined;
  /** The last word on a colour (a linked model drawn halftone). */
  ink?: (colour: string, entityId: number | undefined) => string;
}

export interface ViewStyler {
  face(item: StyleItem): ItemStyle;
  line(item: StyleItem): ItemStyle;
  /** The inputs it was made from: what a cache of its output keys on. */
  readonly inputs: Readonly<ViewStyleInputs>;
  /** Whether its rules read properties: a cache keys on the property source too. */
  readonly readsProperties: boolean;
}

/** What the preset's rules say of one element: only the fields a matched rule set. */
interface Ruled { stroke?: string; fill?: string; weight?: CategoryLineWeight | number }

const NO_ELEMENT = Object.freeze({}) as ElementStyle['own'];

/** What the layers say of one element (by entity, class and phase): resolved once, shared by all its faces and lines. */
interface Entity {
  visible: boolean;
  category: CategoryGraphics | undefined;
  /** The view's own word on the category, which the template's mapping does not beat (the category itself when there is no mapping). */
  viewCategory: CategoryGraphics | undefined;
  classStyle: StyleRuleStyle;
  materialStyle: StyleRuleStyle;
  own: ElementStyle['own'];
  phase: PhaseStyle | null;
  rule: Ruled;
  globalId: string | null | undefined;
  /** The answer per pen slot, for the items that add nothing of their own. */
  slots: Partial<Record<'face' | 'cut' | 'silhouette' | 'projection' | 'hidden', ItemStyle>>;
}

/** The styler of one view: build it once per set of inputs, then ask it per item (it resolves each element once). */
export function viewStyler(inputs: ViewStyleInputs): ViewStyler {
  const { graphics, propertiesOf, globalIdOf, phaseStyle, ink } = inputs;
  const pens = inputs.pens ?? PEN_TABLE;
  const rules = presetRules(graphics);
  const styleRules = graphics?.styleRules?.length ? graphics.styleRules : undefined;
  const engine = rules.length ? new GraphicOverrideEngine(rules) : null;
  const readsProperties = rulesReadProperties(rules);
  const linesHidden = (graphics?.hiddenLines?.length ?? 0) > 0;
  const entities = new Map<number | undefined, Map<string, Entity>>();

  const byRules = (item: StyleItem): Ruled => {
    if (!engine) return {};
    const r: Ruled = {};
    const element: ElementData = { expressId: item.entityId ?? 0, ifcType: item.ifcType ?? '', ...(readsProperties && item.entityId !== undefined && propertiesOf ? { properties: propertiesOf(item.entityId) } : {}) };
    for (const rule of engine.applyOverrides(element).matchedRules) {
      if (rule.style.strokeColor) r.stroke = rule.style.strokeColor;
      if (rule.style.fillColor) r.fill = rule.style.fillColor;
      if (rule.style.lineWeight !== undefined) r.weight = rule.style.lineWeight as CategoryLineWeight | number;
    }
    return r;
  };
  const entityOf = (item: StyleItem): Entity => {
    let byKey = entities.get(item.entityId);
    if (!byKey) entities.set(item.entityId, (byKey = new Map()));
    const key = `${item.ifcType ?? ''}|${item.phase ?? ''}|${styleRules && item.materialId !== undefined ? item.materialId : ''}`;
    let e = byKey.get(key);
    if (e) return e;
    const categoryId = item.ifcType ? CATEGORY_OF.get(item.ifcType.toUpperCase()) : undefined;
    const globalId = item.entityId !== undefined && globalIdOf ? globalIdOf(item.entityId) : undefined;
    // `styledDrawing` stamps the element's style on each of its items; the same answer for all of them.
    const element = item.elementStyle ?? (globalId ? resolveElementGraphics(graphics, globalId, item.ifcType) : null);
    const materialName = styleRules && item.materialId !== undefined && item.entityId !== undefined ? inputs.materialOf?.(item.entityId, item.materialId) : null;
    const { classStyle, materialStyle } = itemRules(styleRules, item.ifcType, materialName);
    const category = categoryId ? graphics?.categories?.[categoryId] : undefined;
    e = {
      visible: element ? element.visible : elementShown(graphics, globalId, item.ifcType),
      category,
      viewCategory: styleRules ? (categoryId ? graphics?.ownCategories?.[categoryId] : undefined) : category,
      classStyle,
      materialStyle,
      own: element?.own ?? NO_ELEMENT,
      phase: item.phase && phaseStyle ? phaseStyle(item.phase) : null,
      rule: byRules(item),
      globalId,
      slots: {},
    };
    byKey.set(key, e);
    return e;
  };
  const mm = (weight: CategoryLineWeight | number, kind: 'cut' | 'projection') => (typeof weight === 'number' ? (kind === 'cut' ? weight : weight / 2) : pens.weights[weight][kind]);

  const resolve = (e: Entity, item: StyleItem, isFace: boolean, kind: PenKind, visible: boolean): ItemStyle => {
    const { own, phase, category, viewCategory, classStyle, materialStyle, rule } = e;
    const colour = (c: string) => (ink ? ink(c, item.entityId) : c);
    const stroke = colour(own.lineColor ?? phase?.lineColor ?? viewCategory?.lineColor ?? classStyle.lineColor ?? category?.lineColor ?? rule.stroke ?? DEFAULT_INK);
    let weight: number;
    let dash: readonly number[];
    if (kind === 'hidden') {
      weight = pens.pens.hidden;
      dash = HIDDEN_DASH_MM;
    } else {
      const word = (kind === 'cut' ? own.cutWeight : own.projectionWeight) ?? phase?.lineWeight ?? viewCategory?.lineWeight ?? classStyle.lineWeight ?? category?.lineWeight ?? rule.weight;
      weight = word !== undefined ? mm(word, kind) : kind === 'cut' ? pens.pens.cut : item.category === 'silhouette' ? pens.pens.outline : pens.pens.seen;
      dash = own.lineStyle ? (own.lineStyle === 'dashed' ? DASH_MM : []) : phase?.dashed ? DASH_MM : [];
    }
    let fill: string | null = null;
    if (isFace) {
      const material = item.materialFill === undefined ? undefined : item.materialFill ?? '#ffffff';
      fill = colour(item.schemeColour ?? own.fillColor ?? phase?.fillColor ?? viewCategory?.fillColor ?? materialStyle.fillColor ?? classStyle.fillColor ?? category?.fillColor ?? material ?? rule.fill ?? DEFAULT_FACE_FILL);
    }
    return { visible, kind, stroke, weight, dash, fill, scheme: isFace && !!item.schemeColour };
  };

  const style = (item: StyleItem, isFace: boolean): ItemStyle => {
    const e = entityOf(item);
    const kind: PenKind = isFace || item.category === 'cut' ? 'cut' : item.visibility === 'hidden' || item.category === 'hidden' ? 'hidden' : 'projection';
    // A single hidden line, a scheme's fill or a material's fill is the item's own: answered for it alone.
    const lineOff = linesHidden && !!item.line && lineHidden(graphics, e.globalId, item.line);
    if (lineOff || (isFace && (item.schemeColour !== undefined || item.materialFill !== undefined))) return resolve(e, item, isFace, kind, e.visible && !lineOff);
    // The halftone ink reads the entity; the slot is per entity already.
    const slot = isFace ? 'face' : kind === 'projection' ? (item.category === 'silhouette' ? 'silhouette' : 'projection') : kind;
    return (e.slots[slot] ??= resolve(e, item, isFace, kind, e.visible));
  };

  return { face: (item) => style(item, true), line: (item) => style(item, false), inputs, readsProperties };
}
