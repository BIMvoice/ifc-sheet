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

import { BUILT_IN_PRESETS, ifcTypeCriterion, type Drawing2D, type DrawingLine, type DrawingPolygon, type GraphicOverrideRule } from '@ifc-lite/drawing-2d';
import type { Pt } from '@/drafting/types';
import { DEFAULT_GRAPHIC_STANDARD } from '@/drafting/graphic-standard';
import type { CategoryGraphics, CategoryLineWeight, PhaseId, ViewGraphics } from './types';
import type { MaterialDrawing, MaterialHatch } from './material-drawing';
import type { SchemeResult } from '@bimvoice/ifcsheet/colour-fills';
import { VIEW_CATEGORY_CLASSES, hiddenClassesOf } from '@bimvoice/ifcsheet';
import { withScheme } from './view-scheme-style';
import type { DraftShape } from '@/drafting/types';

/** A drawing as a view shows it, with its building materials' hatches and membrane lines, and (a view that draws by phase) the phase of each line and cut face. */
export type StyledDrawing = Omit<Drawing2D, 'lines' | 'cutPolygons'> & {
  lines: (DrawingLine & { phase?: PhaseId })[];
  /** `schemeColour`: the fill a colour scheme (#92) gives the element, `#rrggbb`; it wins over the material's and the phase's. */
  cutPolygons: (DrawingPolygon & { phase?: PhaseId; schemeColour?: string })[];
  /** The rooms a colour scheme fills (#92), drawn under everything else. */
  schemeFills?: (DrawingPolygon & { schemeColour: string })[];
  materialHatches?: (MaterialHatch & HatchSource)[];
  membranes?: DraftShape[];
};

/** Which element (and layer material) a hatch was cut from: what the CAD layer standard matches it on. */
export interface HatchSource { ifcType?: string; entityId?: number; materialId?: number }

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

/** The Drawing panel's default preset (IFC material colours). */
export const DEFAULT_VIEW_PRESET = 'preset-3d-colors';

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

function presetRules(graphics: ViewGraphics | undefined): GraphicOverrideRule[] {
  const id = graphics?.presetId === undefined ? DEFAULT_VIEW_PRESET : graphics.presetId;
  return id ? BUILT_IN_PRESETS.find((p) => p.id === id)?.rules ?? [] : [];
}

/** The view's override rules: its preset's, then one rule per overridden category (winning). */
export function viewOverrideRules(graphics: ViewGraphics | undefined): GraphicOverrideRule[] {
  const rules = [...presetRules(graphics)];
  for (const category of VIEW_CATEGORIES) {
    const g: CategoryGraphics | undefined = graphics?.categories?.[category.id];
    if (!g || (!g.lineColor && !g.fillColor && !g.lineWeight)) continue;
    rules.push({
      id: `view-category-${category.id}`,
      name: category.id,
      enabled: true,
      priority: 100000,
      criteria: ifcTypeCriterion([...category.classes]),
      style: {
        ...(g.lineColor ? { strokeColor: g.lineColor } : {}),
        ...(g.fillColor ? { fillColor: g.fillColor } : {}),
        ...(g.lineWeight ? { lineWeight: g.lineWeight } : {}),
      },
    });
  }
  return rules;
}

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
): StyledDrawing {
  return withScheme(styledByGraphics(drawing, graphics, hostTypeOf, replaced, materials, phases), scheme);
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
): StyledDrawing {
  if (materials) {
    const hatchOf = new Map<unknown, HatchSource>(drawing.cutPolygons.map((p) => [p.polygon.outer, { ifcType: p.ifcType, entityId: p.entityId, ...(p.materialId !== undefined ? { materialId: p.materialId } : {}) }]));
    drawing = {
      ...drawing,
      cutPolygons: drawing.cutPolygons.filter((p) => !materials.hidePolygons.has(p)).map((p) => {
        const fill = materials.fills.get(p);
        return fill === undefined ? p : { ...p, color: fill === null ? [1, 1, 1, 1] as [number, number, number, number] : rgba(fill) ?? p.color };
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
  if (hidden.size === 0 && fills.size === 0 && !graphics?.categories) return drawing as StyledDrawing;
  const shown = (type: string | undefined) => !type || !hidden.has(type.toUpperCase());
  // A layer part takes its host's class here, so a category's graphics reach it.
  const relabel = <T extends { entityId: number; ifcType?: string }>(item: T): T => {
    const host = hostTypeOf(item.entityId, item.ifcType);
    return host ? { ...item, ifcType: host } : item;
  };
  return {
    ...(drawing as StyledDrawing),
    cutPolygons: drawing.cutPolygons.map(relabel).filter((p) => shown(p.ifcType)).map((p) => {
      const color = fills.get((p.ifcType ?? '').toUpperCase());
      return color ? { ...p, color } : p;
    }),
    lines: drawing.lines.map(relabel).filter((l) => shown(l.ifcType)),
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
}

/** The cut faces to hatch, by their category's `cutHatch`. */
export function cutHatches(drawing: StyledDrawing, graphics: ViewGraphics | undefined, hatchPens: Record<CategoryLineWeight, number> = DEFAULT_GRAPHIC_STANDARD.materialHatch): CutHatch[] {
  const categories = graphics?.categories;
  const out: CutHatch[] = [];
  // A category's own cut hatch wins over its elements' materials.
  const overridden = (ifcType: string | undefined) => {
    const id = categoryOf(ifcType ?? '');
    const g = id ? categories?.[id] : undefined;
    return !!g?.cutHatch || g?.visible === false;
  };
  for (const h of drawing.materialHatches ?? []) {
    if (overridden(h.ifcType)) continue;
    out.push({ loops: h.loops, pattern: h.pattern, scale: h.scale, color: '#000000', width: hatchPens[h.pen], source: { ifcType: h.ifcType, entityId: h.entityId, materialId: h.materialId } });
  }
  if (!categories) return out;
  for (const polygon of drawing.cutPolygons) {
    const id = categoryOf(polygon.ifcType ?? '');
    const g = id ? categories[id] : undefined;
    if (!g?.cutHatch || g.visible === false) continue;
    out.push({
      loops: [polygon.polygon.outer, ...polygon.polygon.holes],
      pattern: g.cutHatch,
      scale: g.hatchScale ?? 1,
      color: g.lineColor ?? '#000000',
      source: { ifcType: polygon.ifcType, entityId: polygon.entityId, ...(polygon.materialId !== undefined ? { materialId: polygon.materialId } : {}) },
    });
  }
  return out;
}
