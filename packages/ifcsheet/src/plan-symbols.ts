/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The 2D plan symbol of an element, drawn in a plan view instead of the cut or projection of its 3D body (#489).
 *
 * Authoring tools keep a furniture or fixture's plan symbol as a second representation: an IfcShapeRepresentation in
 * a Plan context, usually on the TYPE (IfcRepresentationMap, mapped onto each occurrence by an IfcMappedItem) and
 * sometimes on the occurrence itself, so the 3D body can stay a plain box while the 2D carries the detail.
 *
 * Which representations count: those whose context has ContextType `Plan`, whose RepresentationIdentifier is
 * `FootPrint` (the IFC standard's identifier for it) or `Annotation`, and whose context's TargetView, when it states one,
 * is PLAN_VIEW or NOTDEFINED (a REFLECTED_PLAN_VIEW symbol is the ceiling plan's). Bonsai (IfcOpenShell) writes
 * `Plan` / `Annotation` / `PLAN_VIEW` (`src/bonsai/bonsai/core/project.py` creates the contexts, `bim/module/model/door.py`
 * writes the Annotation / PLAN_VIEW representation of a sliding door) and offers `FootPrint` as a subcontext identifier
 * (`bim/module/context/prop.py`); `Plan` / `Body` / `PLAN_VIEW` is a 2D body of doors and windows, not a symbol, and is not
 * read. Doors and windows are left to their own opening symbols (`apps/viewer/src/drafting/opening-symbols.ts`).
 *
 * `readPlanSymbols` reads them off the parsed entities, in the render frame; `withPlanSymbols` puts them into a plan's
 * drawing, replacing the lines and faces of the elements that have one. The web app and the headless engine both call
 * these two, so the tab, the sheets, the PDF and the DXF cannot disagree. A plan only shows the symbol of an element its
 * drawing shows (cut by the plane, or below it within the view depth); one above the cut stays out, as its body does.
 *
 * Limits: read from the file as parsed, so an element moved or created in the session keeps the symbol it had on
 * loading; the representation context's own WorldCoordinateSystem is taken as the world; the curve kinds in
 * `plan-symbol-curves.ts` are read and the others are reported in `skipped`; a fill area is drawn as its outline, not hatched.
 */

import { RelationshipType } from '@ifc-lite/data';
import { getInheritanceChainAcrossSchemas, extractLengthUnitScale, type IfcDataStore } from '@ifc-lite/parser';
import { ifcToViewerAxes, totalYupOffset, type RenderFrameInfo } from '@ifc-lite/geometry/world-frame';
import { projectTo2D, type Drawing2D, type DrawingLine, type DrawingPolygon } from '@ifc-lite/drawing-2d';
import { IDENTITY, compose, invertRigid, planeAngleScale, placementFrame, axisFrame, ref, type P3 } from './plan-symbol-frame.js';
import { readItem, type CurveContext } from './plan-symbol-curves.js';
import { isPhysicalElement } from './readiness-read.js';

export interface PlanSymbol {
  /** The element's express id in its model. */
  expressId: number;
  /** Polylines in the render frame (Y up, metres), placed by the element's placement. */
  curves: P3[][];
}

export interface PlanSymbolRead {
  symbols: Map<number, PlanSymbol>;
  /** The item classes the symbols held that were not read (`plan-symbol-curves.ts`). */
  skipped: string[];
}

const EMPTY: PlanSymbolRead = { symbols: new Map(), skipped: [] };
const SYMBOL_IDENTIFIERS = new Set(['FOOTPRINT', 'ANNOTATION']);
/** Doors and windows draw from their own opening symbols. */
const OPENING = /^IFC(DOOR|WINDOW)/i;

const text = (v: unknown): string => (typeof v === 'string' ? v.replace(/^\.|\.$/g, '').toUpperCase() : '');

/** Whether a representation context is a plan context (ContextType Plan, own or parent's) whose TargetView is the plan's. */
function isPlanContext(store: IfcDataStore, id: number | null, memo: Map<number, boolean>): boolean {
  if (id === null) return false;
  const known = memo.get(id);
  if (known !== undefined) return known;
  const context = store.getEntity(id);
  const a = context?.attributes ?? [];
  const parent = String(context?.type).toUpperCase() === 'IFCGEOMETRICREPRESENTATIONSUBCONTEXT' ? store.getEntity(ref(a[6]) ?? -1) : null;
  const contextType = text(a[1]) || text(parent?.attributes?.[1]);
  const targetView = String(context?.type).toUpperCase() === 'IFCGEOMETRICREPRESENTATIONSUBCONTEXT' ? text(a[8]) : '';
  const ok = contextType === 'PLAN' && (targetView === '' || targetView === 'PLAN_VIEW' || targetView === 'NOTDEFINED');
  memo.set(id, ok);
  return ok;
}

function lengthUnitScaleOf(store: IfcDataStore): number {
  if (store.lengthUnitScale !== undefined) return store.lengthUnitScale;
  if (!store.source?.length || !store.entityIndex) return 1;
  return extractLengthUnitScale(store.source, store.entityIndex);
}

/** The plan symbol representations of the model: the shape representations whose identifier and context say so. */
function planRepresentations(store: IfcDataStore): Set<number> {
  const out = new Set<number>();
  const contexts = new Map<number, boolean>();
  for (const id of store.entityIndex.byType.get('IFCSHAPEREPRESENTATION') ?? []) {
    const a = store.getEntity(id)?.attributes ?? [];
    if (SYMBOL_IDENTIFIERS.has(text(a[1])) && isPlanContext(store, ref(a[0]), contexts)) out.add(id);
  }
  return out;
}

/** The ids in `byId` that the list attribute `index` of `entity` names. */
const refsOf = (entity: { attributes?: unknown[] } | null, index: number): number[] =>
  (Array.isArray(entity?.attributes?.[index]) ? (entity!.attributes![index] as unknown[]) : []).flatMap((v) => { const r = ref(v); return r === null ? [] : [r]; });

/**
 * Every element's plan symbol, in the render frame `frame` describes (`CoordinateInfo`): through the element's
 * placement, and for a symbol on the type through the type's RepresentationMap origin. An element with a symbol on the
 * occurrence itself takes it over the type's. Empty for a model without a plan representation (one pass over its
 * shape representations).
 */
export function readPlanSymbols(store: IfcDataStore, frame?: RenderFrameInfo | null): PlanSymbolRead {
  if (!store.entityIndex?.byType || typeof store.getEntity !== 'function') return EMPTY;
  const plan = planRepresentations(store);
  if (plan.size === 0) return EMPTY;
  // The product definition shapes and representation maps that hold one.
  const shapes = new Map<number, number[]>();
  for (const id of store.entityIndex.byType.get('IFCPRODUCTDEFINITIONSHAPE') ?? []) {
    const held = refsOf(store.getEntity(id), 2).filter((r) => plan.has(r));
    if (held.length) shapes.set(id, held);
  }
  const maps = new Map<number, number>();
  for (const id of store.entityIndex.byType.get('IFCREPRESENTATIONMAP') ?? []) {
    const rep = ref(store.getEntity(id)?.attributes?.[1]);
    if (rep !== null && plan.has(rep)) maps.set(id, rep);
  }
  const planMapsOfType = new Map<number, number[]>();
  const occurrences: number[] = [];
  const { entities } = store;
  for (let i = 0; i < entities.count; i++) {
    const id = entities.expressId[i];
    const name = entities.getTypeName(id);
    if (isPhysicalElement(name)) {
      if (!OPENING.test(name)) occurrences.push(id);
    } else if (maps.size > 0 && getInheritanceChainAcrossSchemas(name).includes('IfcTypeProduct')) {
      const own = refsOf(store.getEntity(id), 6).filter((m) => maps.has(m));
      if (own.length) planMapsOfType.set(id, own);
    }
  }
  const ctx: CurveContext = { store, angle: planeAngleScale(store), skipped: new Set() };
  const unit = lengthUnitScaleOf(store);
  const offset = totalYupOffset(frame);
  const toRender = (p: P3): P3 => {
    const v = ifcToViewerAxes({ x: p.x * unit, y: p.y * unit, z: p.z * unit });
    return { x: v.x - offset.x, y: v.y - offset.y, z: v.z - offset.z };
  };
  const symbols = new Map<number, PlanSymbol>();
  for (const id of occurrences) {
    const element = store.getEntity(id);
    const placement = placementFrame(store, ref(element?.attributes?.[5]));
    if (!placement) continue;
    const lines: P3[][] = [];
    const shape = ref(element?.attributes?.[6]);
    const direct = shape === null ? undefined : shapes.get(shape);
    if (direct) {
      for (const rep of direct) for (const item of refsOf(store.getEntity(rep), 3)) readItem(ctx, item, placement, lines);
    } else {
      const typeId = store.relationships?.getRelated(id, RelationshipType.DefinesByType, 'inverse')[0];
      for (const map of typeId === undefined ? [] : planMapsOfType.get(typeId) ?? []) {
        const origin = axisFrame(store, ref(store.getEntity(map)?.attributes?.[0]));
        const inner = compose(placement, origin ? invertRigid(origin) : IDENTITY);
        for (const item of refsOf(store.getEntity(maps.get(map)!), 3)) readItem(ctx, item, inner, lines);
      }
    }
    if (lines.length) symbols.set(id, { expressId: id, curves: lines.map((l) => l.map(toRender)) });
  }
  return { symbols, skipped: [...ctx.skipped].sort() };
}

/**
 * `drawing` of a plan with the plan symbol drawn for every element that has one and that the drawing shows: its lines
 * and faces are replaced by the symbol's curves, drawn as cut lines when the plane cut the element, else as seen lines.
 * `entityIdOf` maps a symbol's express id to the id the drawing carries (the app's federated render id; default as is).
 * The drawing itself when the view is not a plan on a horizontal plane or no element has a symbol to show.
 */
export function withPlanSymbols(drawing: Drawing2D, symbols: ReadonlyMap<number, PlanSymbol>, entityIdOf: (expressId: number) => number = (id) => id): Drawing2D {
  const plane = drawing.config.plane;
  if (symbols.size === 0 || plane.axis !== 'y' || plane.customPlane) return drawing;
  const shown = new Map<number, { cut: boolean; ifcType: string; modelIndex: number }>();
  const note = (entityId: number, cut: boolean, ifcType: string, modelIndex: number) => {
    const known = shown.get(entityId);
    shown.set(entityId, { cut: (known?.cut ?? false) || cut, ifcType: known?.ifcType ?? ifcType, modelIndex: known?.modelIndex ?? modelIndex });
  };
  for (const l of drawing.lines) if (l.visibility !== 'hidden') note(l.entityId, l.category === 'cut', l.ifcType, l.modelIndex);
  for (const p of drawing.cutPolygons) note(p.entityId, true, p.ifcType, p.modelIndex);
  for (const p of drawing.projectionPolygons) note(p.entityId, false, p.ifcType, p.modelIndex);
  const drawn = new Map<number, PlanSymbol>();
  for (const symbol of symbols.values()) if (shown.has(entityIdOf(symbol.expressId))) drawn.set(entityIdOf(symbol.expressId), symbol);
  if (drawn.size === 0) return drawing;
  const keep = <T extends { entityId: number }>(rows: T[]) => rows.filter((r) => !drawn.has(r.entityId));
  const added: DrawingLine[] = [];
  const bounds = { min: { ...drawing.bounds.min }, max: { ...drawing.bounds.max } };
  for (const [entityId, symbol] of drawn) {
    const info = shown.get(entityId)!;
    for (const curve of symbol.curves) {
      for (let i = 0; i + 1 < curve.length; i++) {
        const start = projectTo2D(curve[i], 'y', plane.flipped);
        const end = projectTo2D(curve[i + 1], 'y', plane.flipped);
        for (const p of [start, end]) {
          bounds.min.x = Math.min(bounds.min.x, p.x); bounds.min.y = Math.min(bounds.min.y, p.y);
          bounds.max.x = Math.max(bounds.max.x, p.x); bounds.max.y = Math.max(bounds.max.y, p.y);
        }
        added.push({ line: { start, end }, category: info.cut ? 'cut' : 'projection', visibility: 'visible', entityId, ifcType: info.ifcType, modelIndex: info.modelIndex, depth: 0 });
      }
    }
  }
  const lines = [...keep(drawing.lines), ...added];
  const polygons = (rows: DrawingPolygon[]) => keep(rows);
  return {
    ...drawing,
    lines,
    cutPolygons: polygons(drawing.cutPolygons),
    projectionPolygons: polygons(drawing.projectionPolygons),
    ...(drawing.layerBaseCutPolygons ? { layerBaseCutPolygons: polygons(drawing.layerBaseCutPolygons) } : {}),
    bounds,
    stats: { ...drawing.stats, cutLineCount: lines.filter((l) => l.category === 'cut').length },
  };
}

/** Whether a view draws plan symbols: on unless its graphics say `usePlanSymbols: false`. */
export const planSymbolsOn = (graphics: { usePlanSymbols?: boolean } | undefined): boolean => graphics?.usePlanSymbols !== false;
