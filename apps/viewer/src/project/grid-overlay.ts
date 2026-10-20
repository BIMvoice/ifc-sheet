/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The model's structural grid (IfcGrid) as a view's overlay: every axis a
 * thin dash-dot line past the building, with a circled bubble carrying its
 * AxisTag at the chosen ends. A plan draws the axes whole; a section or
 * elevation draws those that cross its plane, as verticals at the crossing,
 * bubbles at the head (and the foot). One overlay, so the live view, a sheet
 * viewport, the sheet SVG / PDF and the DXF (layer GRID) all carry it.
 *
 * Position is read, never inferred: `extractGridAxesForStorey` composes the
 * grid's ObjectPlacement chain up to the storey's frame exactly as it does a
 * wall's (`frameInStoreyFrame`) and applies the file's length-unit scale;
 * the storey workplane (`buildStoreyWorkplane`) then takes storey-local metres
 * to the render frame the drawing was cut in, the step the roof and corridor
 * overlays use. Overlays are derived from the live store on every call, so a
 * grid edited, moved or re-tagged follows; each axis is identified by its
 * grid's GlobalId and its tag (`ViewGridAxis.key`). A model with no IfcGrid is
 * skipped before any extraction, and the extracted axes are reused until the
 * store's `mutationVersion` (or the model's mutation view) changes.
 */

import type { Drawing2D, SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { extractGridAxesForStorey, type GridAxisSegment } from '@ifc-lite/create';
import type { IfcDataStore } from '@ifc-lite/parser';
import type { MutablePropertyView } from '@ifc-lite/mutations';
import { useViewerStore } from '@/store';
import { buildStoreyWorkplane } from '@/lib/commands/modeling/workplane';
import type { Workplane } from '@/lib/commands/modeling/types';
import { worldToDrawing } from '@/drafting/frame';
import type { DraftShape, Pt } from '@/drafting/types';
import { PEN } from '@/components/viewer/sheets/viewport-pens';
import type { PlanOverlay } from './plan-overlays';
import type { GridEnds, ProjectView } from './types';
import { DEFAULT_VIEW_SCALE } from './viewport-annotation';

type Vec3 = [number, number, number];

/**
 * Bubble radius and the line stub between the building and its bubble, paper
 * millimetres. Stub plus bubble diameter is 10 mm: what the auto-fit viewport
 * box (`fitViewportBox`) keeps clear around a drawing, so a bubble is never clipped.
 */
export const BUBBLE_RADIUS_MM = 4;
export const AXIS_STUB_MM = 2;

/** One axis in the render frame (Y up, the frame the drawing was cut in), at its storey's floor. */
export interface ViewGridAxis {
  /** `<grid GlobalId>:<AxisTag>`: what an axis is called across model updates. */
  key: string;
  tag: string;
  a: Vec3;
  b: Vec3;
}

/** A view's grid settings with their defaults: on for plans and sections, off for elevations; bubbles at both ends. */
export function gridSettings(view: ProjectView): { visible: boolean; ends: GridEnds } {
  const g = view.graphics?.grid;
  return { visible: g?.visible ?? (view.kind === 'plan' || view.kind === 'section'), ends: g?.ends ?? 'both' };
}

type ExtractGridAxes = typeof extractGridAxesForStorey;
let extractAxes: ExtractGridAxes = extractGridAxesForStorey;

/**
 * Extracted storey axes, per model store, valid for one `mutationVersion` and
 * one mutation view. Extraction re-parses the spatial relationships from the
 * source bytes, so it runs once per storey per edit, not on every recompute.
 * Keyed by the store itself: a model reloaded under the same id is a new store.
 */
interface AxesMemo { version: number; view: MutablePropertyView | null; byStorey: Map<number, GridAxisSegment[]> }
let axesMemo = new WeakMap<IfcDataStore, AxesMemo>();

/** Swap the extractor (to count calls) and drop the memo; `null` restores the real one. */
export function setGridExtractorForTests(fn: ExtractGridAxes | null): void {
  extractAxes = fn ?? extractGridAxesForStorey;
  axesMemo = new WeakMap();
}

/** Whether the model can hold an IfcGrid at all: one parsed from the file, created this session, or retyped to one. */
function modelHasGrid(store: IfcDataStore, view: MutablePropertyView | null): boolean {
  if ((store.entityIndex?.byType.get('IFCGRID')?.length ?? 0) > 0) return true;
  if (!view) return false;
  if (!view.getNewEntitiesOfType('IFCGRID').next().done) return true;
  for (const { newType } of view.getTypeMutations().values()) if (newType.toUpperCase() === 'IFCGRID') return true;
  return false;
}

function storeyAxes(store: IfcDataStore, view: MutablePropertyView | null, storeyId: number, mutationVersion?: number): GridAxisSegment[] {
  if (mutationVersion === undefined) return extractAxes(store, storeyId, view ?? undefined).axes;
  let memo = axesMemo.get(store);
  if (!memo || memo.version !== mutationVersion || memo.view !== view) {
    memo = { version: mutationVersion, view, byStorey: new Map() };
    axesMemo.set(store, memo);
  }
  let axes = memo.byStorey.get(storeyId);
  if (!axes) {
    axes = extractAxes(store, storeyId, view ?? undefined).axes;
    memo.byStorey.set(storeyId, axes);
  }
  return axes;
}

/**
 * The axes of the grids that apply to one storey, in the render frame: storey-local metres through the storey workplane.
 * With `mutationVersion`, the extracted axes are reused until the model is edited.
 */
export function gridAxesInRender(
  store: IfcDataStore, view: MutablePropertyView | null, storeyId: number, workplane: Workplane, mutationVersion?: number,
): { axisId: number; axis: ViewGridAxis }[] {
  return storeyAxes(store, view, storeyId, mutationVersion).map((a) => ({
    axisId: a.axisId,
    axis: {
      key: `${store.entities.getGlobalId(a.gridId) || `#${a.gridId}`}:${a.AxisTag}`,
      tag: a.AxisTag,
      a: workplane.localToRender([a.a[0], a.a[1], 0]) as Vec3,
      b: workplane.localToRender([a.b[0], a.b[1], 0]) as Vec3,
    },
  }));
}

/** Every grid axis a view can draw, from the live store. A plan reads its own storeys; a section or elevation, every storey. */
function viewGridAxes(view: ProjectView): ViewGridAxis[] {
  const s = useViewerStore.getState();
  const wanted = view.kind === 'plan' ? new Set(view.level.storeyGlobalIds) : new Set<string>();
  const out: ViewGridAxis[] = [];
  for (const [modelId, model] of s.models) {
    const store = model.ifcDataStore;
    const storeys = store?.spatialHierarchy?.storeyElevations;
    if (!store || !storeys) continue;
    const mv = s.mutationViews.get(modelId) ?? null;
    // No IfcGrid anywhere in the model: nothing to extract, and no storey walk.
    if (!modelHasGrid(store, mv)) continue;
    const seen = new Set<number>();
    for (const storeyId of [...storeys.keys()].sort((x, y) => (storeys.get(x) ?? 0) - (storeys.get(y) ?? 0))) {
      if (wanted.size && !wanted.has(store.entities.getGlobalId(storeyId) ?? '')) continue;
      const workplane = buildStoreyWorkplane(s, modelId, storeyId, 0);
      if ('refused' in workplane) continue;
      // One grid runs through every storey it serves: the lowest one draws it.
      for (const { axisId, axis } of gridAxesInRender(store, mv, storeyId, workplane, s.mutationVersion)) {
        if (!seen.has(axisId)) {
          seen.add(axisId);
          out.push(axis);
        }
      }
    }
  }
  return out;
}

/** The parameter range `[t0, t1]` of the line `o + t u` (`u` a unit vector) inside `box`, or null when it misses it. */
function clipToBox(o: Pt, u: Pt, box: { min: Pt; max: Pt }): readonly [number, number] | null {
  let t0 = -Infinity, t1 = Infinity;
  for (const [p, d, lo, hi] of [[o.x, u.x, box.min.x, box.max.x], [o.y, u.y, box.min.y, box.max.y]] as const) {
    if (Math.abs(d) < 1e-12) {
      if (p < lo || p > hi) return null;
      continue;
    }
    const a = (lo - p) / d, b = (hi - p) / d;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  }
  return t0 < t1 ? [t0, t1] : null;
}

const circle = (c: Pt, r: number): DraftShape => ({ type: 'circle', c, r });

/**
 * The overlays of `axes` in a view: GRID lines (dash-dot) and GRID bubbles
 * (continuous, tag as text). `unit` is model metres per paper millimetre at
 * the view's scale, so bubbles print the same size at any scale. A section
 * runs its verticals from `bounds` (drawing coordinates) outward.
 */
export function gridOverlaysOf(
  axes: readonly ViewGridAxis[], kind: ProjectView['kind'], plane: SectionPlaneConfig, ends: GridEnds, unit: number,
  bounds?: { min: Pt; max: Pt } | null,
): PlanOverlay[] {
  const lines: DraftShape[] = [], bubbles: DraftShape[] = [], texts: { at: Pt; text: string }[] = [];
  const r = BUBBLE_RADIUS_MM * unit;
  const bubble = (c: Pt, tag: string) => {
    bubbles.push(circle(c, r));
    texts.push({ at: c, text: tag });
  };
  if (kind === 'plan') {
    for (const axis of axes) {
      const a = worldToDrawing(plane, { x: axis.a[0], y: axis.a[1], z: axis.a[2] });
      const b = worldToDrawing(plane, { x: axis.b[0], y: axis.b[1], z: axis.b[2] });
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1e-9) continue;
      const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
      const stub = AXIS_STUB_MM * unit;
      // With the drawing's extent known, the axis runs across it (the line clipped to its box), a stub beyond;
      // without, it keeps its authored ends.
      const span = bounds ? clipToBox(a, u, bounds) : [0, len] as const;
      if (!span) continue;
      const from = { x: a.x + u.x * (span[0] - stub), y: a.y + u.y * (span[0] - stub) }, to = { x: a.x + u.x * (span[1] + stub), y: a.y + u.y * (span[1] + stub) };
      lines.push({ type: 'line', a: from, b: to });
      if (ends !== 'end') bubble({ x: from.x - u.x * r, y: from.y - u.y * r }, axis.tag);
      if (ends !== 'start') bubble({ x: to.x + u.x * r, y: to.y + u.y * r }, axis.tag);
    }
  } else if (bounds) {
    const c = plane.customPlane;
    // The plane's origin and unit normal in the render frame.
    const origin: Vec3 = c ? [c.origin.x, c.origin.y, c.origin.z] : [plane.axis === 'x' ? plane.position : 0, plane.axis === 'y' ? plane.position : 0, plane.axis === 'z' ? plane.position : 0];
    const normal: Vec3 = c
      ? [c.tangent.y * c.bitangent.z - c.tangent.z * c.bitangent.y, c.tangent.z * c.bitangent.x - c.tangent.x * c.bitangent.z, c.tangent.x * c.bitangent.y - c.tangent.y * c.bitangent.x]
      : [plane.axis === 'x' ? 1 : 0, plane.axis === 'y' ? 1 : 0, plane.axis === 'z' ? 1 : 0];
    const dist = (p: Vec3) => (p[0] - origin[0]) * normal[0] + (p[1] - origin[1]) * normal[1] + (p[2] - origin[2]) * normal[2];
    const foot = bounds.min.y - AXIS_STUB_MM * unit, head = bounds.max.y + AXIS_STUB_MM * unit;
    for (const axis of axes) {
      const da = dist(axis.a), db = dist(axis.b);
      // Crosses (or ends on) the plane; an axis lying in it is not a crossing.
      if (da * db > 0 || (Math.abs(da) < 1e-9 && Math.abs(db) < 1e-9)) continue;
      const t = da / (da - db);
      const x = worldToDrawing(plane, {
        x: axis.a[0] + t * (axis.b[0] - axis.a[0]), y: axis.a[1] + t * (axis.b[1] - axis.a[1]), z: axis.a[2] + t * (axis.b[2] - axis.a[2]),
      }).x;
      if (x < bounds.min.x || x > bounds.max.x) continue;
      lines.push({ type: 'line', a: { x, y: foot }, b: { x, y: head } });
      if (ends !== 'start') bubble({ x, y: head + r }, axis.tag);
      if (ends !== 'end') bubble({ x, y: foot - r }, axis.tag);
    }
  }
  return [
    { layer: 'GRID', width: PEN.hatch, lineType: 'dashdot' as const, shapes: lines },
    { layer: 'GRID', width: PEN.seen, shapes: bubbles, texts },
  ].filter((o) => o.shapes.length);
}

/** The grid of a view as overlays (none when the view hides it or the model has no grid). `scale` is the denominator the drawing is shown at (a sheet viewport's); absent, the view's own. */
export function gridOverlays(view: ProjectView, plane: SectionPlaneConfig, drawing?: Drawing2D | null, scale?: number): PlanOverlay[] {
  const { visible, ends } = gridSettings(view);
  if (!visible || view.kind === '3d') return [];
  const axes = viewGridAxes(view);
  if (axes.length === 0) return [];
  return gridOverlaysOf(axes, view.kind, plane, ends, (scale && scale > 0 ? scale : view.scale && view.scale > 0 ? view.scale : DEFAULT_VIEW_SCALE) / 1000, drawing?.bounds);
}
