/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A view's own graphics, Revit's Visibility / Graphics: the view picks a
 * graphic override preset (`@ifc-lite/drawing-2d`'s built-in ones, the
 * Drawing panel's default unless it says otherwise) and overrides it per
 * element category — hide a category, give it a line colour, a cut fill, a
 * line weight, or a CAD cut hatch from the hatch library. Everything here is
 * pure: the drafting view turns it into an override engine, a filtered
 * drawing and hatch regions.
 */

import type { Drawing2D, DrawingLine, DrawingPolygon } from '@ifc-lite/drawing-2d';
import type { Pt } from '@/drafting/types';
import { DEFAULT_GRAPHIC_STANDARD } from '@/drafting/graphic-standard';
import type { CategoryLineWeight, PhaseId, ResolvedViewGraphics, ViewGraphics } from './types';
import type { MaterialDrawing, MaterialHatch } from './material-drawing';
import type { SchemeResult } from '@bimvoice/ifcsheet/colour-fills';
import { VIEW_CATEGORY_CLASSES, elementShown, itemRules, hasElementGraphics, hiddenClassesOf, lineHidden, resolveElementGraphics, type ElementStyle } from '@bimvoice/ifcsheet';
import { withScheme } from './view-scheme-style';
import type { DraftShape } from '@/drafting/types';

/** A drawing as a view shows it, with its building materials' hatches and membrane lines, and (a view that draws by phase) the phase of each line and cut face. */
export type StyledDrawing = Omit<Drawing2D, 'lines' | 'cutPolygons'> & {
  /** `elementStyle`: how the view draws THIS element (#32), the engine's `resolveElementGraphics`; absent for an element the view says nothing about. */
  lines: (DrawingLine & { phase?: PhaseId; elementStyle?: ElementStyle })[];
  /**
   * `schemeColour`: the fill a colour scheme (#92) gives the element, `#rrggbb`; it wins over the material's and the phase's.
   * `materialFill`: the fill its building material gives the face (null: none), which the view's styler reads (`view-style.ts`, #34).
   */
  cutPolygons: (DrawingPolygon & { phase?: PhaseId; schemeColour?: string; elementStyle?: ElementStyle; materialFill?: string | null })[];
  /** The rooms a colour scheme fills (#92), drawn under everything else. */
  schemeFills?: (DrawingPolygon & { schemeColour: string; /** The pattern drawn over the room's colour (#493). */ schemeHatch?: string })[];
  materialHatches?: (MaterialHatch & HatchSource)[];
  membranes?: DraftShape[];
};

/** Which element (and layer material) a hatch was cut from: what the CAD layer standard matches it on. */
export interface HatchSource { ifcType?: string; entityId?: number; materialId?: number; elementStyle?: ElementStyle }

/** The phases a view shows and the phase of an element (by the drawing's entity id; null: not a model element, always shown). */
export interface PhaseView {
  show: ReadonlySet<PhaseId>;
  phaseOf: (entityId: number) => PhaseId | null;
  /** The phase an element of a phase is drawn with, when the view draws one phase in another's style (a survey). */
  drawnAs?: (phase: PhaseId) => PhaseId;
}

/** The drawing with each element's lines and cut faces marked with its phase (the other phases never reach it: `phaseHiddenIds` leaves them out of the generator's input). */
function phased(drawing: StyledDrawing, phases: PhaseView): StyledDrawing {
  const mark = (id: number): { phase?: PhaseId } => {
    const phase = phases.phaseOf(id);
    return phase === null ? {} : { phase: phases.drawnAs?.(phase) ?? phase };
  };
  return {
    ...drawing,
    cutPolygons: drawing.cutPolygons.map((p) => ({ ...p, ...mark(p.entityId) })),
    lines: drawing.lines.map((l) => ({ ...l, ...mark(l.entityId) })),
  };
}

export interface ViewCategory {
  id: string;
  labelKey: string;
  classes: readonly string[];
}

const CATEGORY_LABELS = {
  walls: 'viewGraphics.cat.walls', slabs: 'viewGraphics.cat.slabs', roofs: 'viewGraphics.cat.roofs', columns: 'viewGraphics.cat.columns', beams: 'viewGraphics.cat.beams',
  doors: 'viewGraphics.cat.doors', windows: 'viewGraphics.cat.windows', stairs: 'viewGraphics.cat.stairs', railings: 'viewGraphics.cat.railings',
  spaces: 'viewGraphics.cat.spaces', furniture: 'viewGraphics.cat.furniture', other: 'viewGraphics.cat.other',
} as const satisfies Record<(typeof VIEW_CATEGORY_CLASSES)[number]['id'], string>;

/** The categories, from the engine's table (`VIEW_CATEGORY_CLASSES`), so the app and the headless sheets hide the same classes. */
export const VIEW_CATEGORIES: readonly ViewCategory[] = VIEW_CATEGORY_CLASSES.map((c) => ({ id: c.id, labelKey: CATEGORY_LABELS[c.id], classes: c.classes }));

/** Upper-case IFC class → category id. */
const CATEGORY_OF = new Map<string, string>(VIEW_CATEGORIES.flatMap((c) => c.classes.map((k) => [k.toUpperCase(), c.id] as const)));

export function categoryOf(ifcType: string): string | null {
  return CATEGORY_OF.get(ifcType.toUpperCase()) ?? null;
}

/** The view's override rules (its preset's, then one per restyled category) and the default preset: the engine's, which the one styler reads (#34). */
export { DEFAULT_VIEW_PRESET, viewOverrideRules } from '@bimvoice/ifcsheet';

/** Upper-case IFC classes of the categories the view hides (the engine's, `hiddenClassesOf`). */
export const hiddenClasses: (graphics: ViewGraphics | undefined) => Set<string> = hiddenClassesOf;

function rgba(hex: string): [number, number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
}

/**
 * The drawing as the view shows it: hidden categories' cut faces and lines
 * dropped, and the cut faces of categories with a fill colour stamped with
 * it (so it wins over IFC material colours too). The same object when the
 * view changes nothing.
 */
export function styledDrawing(
  drawing: Drawing2D,
  graphics: ViewGraphics | undefined,
  hostTypeOf: (entityId: number, ifcType: string | undefined) => string | null = () => null,
  /** Elements a symbol draws instead (a plan's configured doors and windows): their cut and lines are left out. */
  replaced?: (entityId: number, ifcType: string | undefined) => boolean,
  /** The cut by building materials (`material-drawing.ts`), computed on this same drawing. */
  materials?: MaterialDrawing | null,
  /** A view that draws by phase (`phases.ts`): each element's lines and cut faces carry its phase. */
  phases?: PhaseView | null,
  /** What the view's colour scheme paints (`view-colour-scheme.ts`, #92). */
  scheme?: SchemeResult | null,
  /** The GlobalId of a drawing item's element (the drawing carries renderer ids): how the view's hidden elements, lines and per-element graphics (#32, #33) find theirs. */
  globalIdOf?: (entityId: number) => string | null | undefined,
): StyledDrawing {
  return withScheme(styledByGraphics(drawing, graphics, hostTypeOf, replaced, materials, phases, globalIdOf), scheme);
}

function styledByGraphics(
  drawing: Drawing2D,
  graphics: ViewGraphics | undefined,
  hostTypeOf: (entityId: number, ifcType: string | undefined) => string | null = () => null,
  /** Elements a symbol draws instead (a plan's configured doors and windows): their cut and lines are left out. */
  replaced?: (entityId: number, ifcType: string | undefined) => boolean,
  /** The cut by building materials (`material-drawing.ts`), computed on this same drawing. */
  materials?: MaterialDrawing | null,
  /** A view that draws by phase (`phases.ts`): each element's lines and cut faces carry its phase. */
  phases?: PhaseView | null,
  globalIdOf?: (entityId: number) => string | null | undefined,
): StyledDrawing {
  if (materials) {
    const hatchOf = new Map<unknown, HatchSource>(drawing.cutPolygons.map((p) => [p.polygon.outer, { ifcType: p.ifcType, entityId: p.entityId, ...(p.materialId !== undefined ? { materialId: p.materialId } : {}) }]));
    drawing = {
      ...drawing,
      cutPolygons: drawing.cutPolygons.filter((p) => !materials.hidePolygons.has(p)).map((p) => {
        const fill = materials.fills.get(p);
        return fill === undefined ? p : { ...p, materialFill: fill, color: fill === null ? [1, 1, 1, 1] as [number, number, number, number] : rgba(fill) ?? p.color };
      }),
      lines: materials.dropLines.size ? drawing.lines.filter((l) => !materials.dropLines.has(l)) : drawing.lines,
      materialHatches: materials.hatches.map((h) => ({ ...h, ...(hatchOf.get(h.loops[0]) ?? { ifcType: undefined }) })),
      membranes: materials.membranes,
    } as StyledDrawing;
  }
  if (replaced) {
    drawing = {
      ...drawing,
      cutPolygons: drawing.cutPolygons.filter((p) => !replaced(p.entityId, p.ifcType)),
      lines: drawing.lines.filter((l) => !replaced(l.entityId, l.ifcType)),
    };
  }
  if (phases) drawing = phased(drawing as StyledDrawing, phases);
  const hidden = hiddenClasses(graphics);
  const fills = new Map<string, [number, number, number, number]>();
  for (const category of VIEW_CATEGORIES) {
    const fill = graphics?.categories?.[category.id]?.fillColor;
    const color = fill ? rgba(fill) : null;
    if (color) for (const k of category.classes) fills.set(k.toUpperCase(), color);
  }
  // Single elements and lines (#32, #33) are known by GlobalId; one lookup per element, not per line.
  const named = hasElementGraphics(graphics) && globalIdOf ? globalIdOf : null;
  if (hidden.size === 0 && fills.size === 0 && !graphics?.categories && !named) return drawing as StyledDrawing;
  const ids = new Map<number, string | null | undefined>();
  const gid = (entityId: number) => {
    if (!named) return undefined;
    if (!ids.has(entityId)) ids.set(entityId, named(entityId));
    return ids.get(entityId);
  };
  // The element's own word (hidden, or visible in a hidden category) over its category's.
  const shown = (item: { entityId: number; ifcType?: string }) => elementShown(graphics, gid(item.entityId), item.ifcType);
  // A layer part takes its host's class here, so a category's graphics reach it.
  const relabel = <T extends { entityId: number; ifcType?: string }>(item: T): T => {
    const host = hostTypeOf(item.entityId, item.ifcType);
    return host ? { ...item, ifcType: host } : item;
  };
  const stamp = <T extends { entityId?: number; ifcType?: string }>(item: T): T => {
    const style = named && item.entityId !== undefined ? resolveElementGraphics(graphics, gid(item.entityId), item.ifcType) : null;
    return style ? { ...item, elementStyle: style } : item;
  };
  const styled = drawing as StyledDrawing;
  return {
    ...styled,
    cutPolygons: styled.cutPolygons.map(relabel).filter(shown).map((p) => {
      const color = fills.get((p.ifcType ?? '').toUpperCase());
      return stamp(color ? { ...p, color } : p);
    }),
    lines: styled.lines.map(relabel).filter((l) => shown(l) && !lineHidden(graphics, gid(l.entityId), l.line)).map(stamp),
    ...(styled.materialHatches ? { materialHatches: styled.materialHatches.filter((h) => h.entityId === undefined || shown({ entityId: h.entityId, ifcType: h.ifcType })).map(stamp) } : {}),
  };
}

export interface CutHatch {
  loops: Pt[][];
  pattern: string;
  scale: number;
  color: string;
  /** Pen of the hatch lines, paper millimetres (absent: the hatch pen). */
  width?: number;
  /** The element it was cut from. */
  source?: HatchSource;
  /** A colour scheme's hatch over a room (#493), not a cut face's: the sheet and the DXF write it on its own. */
  scheme?: true;
}

/**
 * The cut faces to hatch, by their element's `cutHatch` (#32), else the view's own category's, else the template's mapping
 * (#31: its material rules over its class rules, `materialNameOf` naming the IfcMaterial of a cut band), else the template's category's.
 */
export function cutHatches(
  drawing: StyledDrawing, graphics: ResolvedViewGraphics | undefined, hatchPens: Record<CategoryLineWeight, number> = DEFAULT_GRAPHIC_STANDARD.materialHatch,
  materialNameOf?: (entityId: number, materialId: number) => string | null | undefined,
): CutHatch[] {
  const categories = graphics?.categories;
  const mapping = graphics?.styleRules;
  // With a mapping the view's own categories (`ownCategories`) are the ones that beat it; the template's are the fallback under it.
  const viewCategories = mapping ? graphics?.ownCategories : categories;
  const ruled = (ifcType: string | undefined, entityId: number | undefined, materialId: number | undefined) =>
    itemRules(mapping, ifcType, mapping && materialId !== undefined && entityId !== undefined ? materialNameOf?.(entityId, materialId) : null);
  const out: CutHatch[] = [];
  // A category's (or an element's) own cut hatch, or a rule's, wins over its elements' materials.
  const overridden = (ifcType: string | undefined, elementStyle?: ElementStyle, entityId?: number, materialId?: number) => {
    const id = categoryOf(ifcType ?? '');
    const g = id ? categories?.[id] : undefined;
    const r = mapping ? ruled(ifcType, entityId, materialId) : null;
    return !!g?.cutHatch || g?.visible === false || !!elementStyle?.cutHatch || !!r?.materialStyle.cutHatch || !!r?.classStyle.cutHatch;
  };
  // A colour scheme's hatch over its rooms (#493): the room is a polygon of its own, under everything, and its pattern is a hairline.
  for (const f of drawing.schemeFills ?? []) {
    if (f.schemeHatch) out.push({ loops: [f.polygon.outer, ...f.polygon.holes], pattern: f.schemeHatch, scale: 1, color: '#000000', width: hatchPens.hairline, scheme: true, source: { ifcType: 'IfcSpace', entityId: f.entityId } });
  }
  for (const h of drawing.materialHatches ?? []) {
    if (overridden(h.ifcType, h.elementStyle, h.entityId, h.materialId)) continue;
    out.push({ loops: h.loops, pattern: h.pattern, scale: h.scale, color: '#000000', width: hatchPens[h.pen], source: { ifcType: h.ifcType, entityId: h.entityId, materialId: h.materialId } });
  }
  for (const polygon of drawing.cutPolygons) {
    const id = categoryOf(polygon.ifcType ?? '');
    const g = id ? categories?.[id] : undefined;
    const own = polygon.elementStyle;
    const mine = id ? viewCategories?.[id] : undefined;
    const r = mapping ? ruled(polygon.ifcType, polygon.entityId, polygon.materialId) : null;
    // The element's style already holds its category's hatch under its own (`resolveElementGraphics`).
    const fromRules = r?.materialStyle.cutHatch ? r.materialStyle : r?.classStyle.cutHatch ? r.classStyle : undefined;
    const pattern = own?.cutHatch ?? (g?.visible === false ? undefined : mapping ? mine?.cutHatch ?? fromRules?.cutHatch ?? g?.cutHatch : g?.cutHatch);
    if (!pattern) continue;
    const fromView = !!mapping && !own?.cutHatch && !!mine?.cutHatch;
    const hatchOwner = own?.cutHatch ? undefined : fromView ? mine : fromRules ?? g;
    out.push({
      loops: [polygon.polygon.outer, ...polygon.polygon.holes],
      pattern,
      scale: own?.hatchScale ?? hatchOwner?.hatchScale ?? g?.hatchScale ?? 1,
      color: own?.lineColor ?? mine?.lineColor ?? r?.classStyle.lineColor ?? g?.lineColor ?? '#000000',
      source: { ifcType: polygon.ifcType, entityId: polygon.entityId, ...(polygon.materialId !== undefined ? { materialId: polygon.materialId } : {}) },
    });
  }
  return out;
}
