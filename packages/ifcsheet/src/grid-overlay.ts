/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The model's structural grid (IfcGrid) as the strokes a view draws (#707): every axis a dash-dot line past the building with a circled
 * bubble at its ends (a plan), or a vertical at the crossing of a section or elevation. Pure: the app's `gridOverlays` and the headless
 * annotate run both call it, the app through the viewer store's storey workplane (`gridAxesInRender`), headless through
 * {@link gridAxesOfModel}, so a label keeps off a bubble or an axis line in both.
 */

import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { extractGridAxesForStorey, effectiveStoreyElevation, fromStoreyLocal, storeyPlanFrame, type StoreyPlanFrame } from '@ifc-lite/create';
import { totalYupOffset } from '@ifc-lite/geometry/world-frame';
import type { IfcDataStore } from '@ifc-lite/parser';
import type { DraftShape, Pt } from './draft-types.js';
import { worldToDrawing, type Vec3 as World } from './drawing-frame.js';
import { overlayObstacleBoxes, type ObstacleBox } from './dimall/plan-obstacles.js';
import type { GridEnds } from './view-graphics-types.js';

type Vec3 = [number, number, number];

/** A storey with no placement chain to read (one authored this session) lies in the model's frame. */
const IDENTITY_PLAN: StoreyPlanFrame = { origin: [0, 0], axisX: [1, 0] };

/** Bubble radius and the line stub between the building and its bubble, paper millimetres. Stub plus bubble diameter is 10 mm: what a viewport box keeps clear around a drawing. */
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

/** The strokes of a grid in a view: its axis lines (drawn dash-dot), its bubbles (circles, continuous) and the tag at the centre of each. */
export interface GridShapes { lines: DraftShape[]; bubbles: DraftShape[]; texts: { at: Pt; text: string }[] }

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

/**
 * The strokes of `axes` in a view of `kind`. `unit` is model metres per paper millimetre at the view's scale, so bubbles print the same
 * size at any scale. A section runs its verticals from `bounds` (drawing coordinates) outward.
 */
export function gridShapesOf(
  axes: readonly ViewGridAxis[], kind: string, plane: SectionPlaneConfig, ends: GridEnds, unit: number,
  bounds?: { min: Pt; max: Pt } | null,
): GridShapes {
  const lines: DraftShape[] = [], bubbles: DraftShape[] = [], texts: { at: Pt; text: string }[] = [];
  const r = BUBBLE_RADIUS_MM * unit;
  const bubble = (c: Pt, tag: string) => {
    bubbles.push({ type: 'circle', c, r });
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
      const world: World = { x: axis.a[0] + t * (axis.b[0] - axis.a[0]), y: axis.a[1] + t * (axis.b[1] - axis.a[1]), z: axis.a[2] + t * (axis.b[2] - axis.a[2]) };
      const x = worldToDrawing(plane, world).x;
      if (x < bounds.min.x || x > bounds.max.x) continue;
      lines.push({ type: 'line', a: { x, y: foot }, b: { x, y: head } });
      if (ends !== 'start') bubble({ x, y: head + r }, axis.tag);
      if (ends !== 'end') bubble({ x, y: foot - r }, axis.tag);
    }
  }
  return { lines, bubbles, texts };
}

/** The boxes a label keeps clear of: the axis lines (marked dashed, as the app's dash-dot overlay is) and the bubbles. */
export const gridObstacles = (shapes: Pick<GridShapes, 'lines' | 'bubbles'>): ObstacleBox[] =>
  overlayObstacleBoxes([{ shapes: shapes.lines, lineType: 'dashdot' }, { shapes: shapes.bubbles }]);

/**
 * The grid axes a plan on `storeyGlobalIds` can draw (every storey with none), in the render frame of a model opened headlessly: its storey's
 * frame through `coordinateInfo`, no placement or federation alignment. One grid runs through every storey it serves: the lowest draws it.
 */
export function gridAxesOfModel(store: IfcDataStore, coordinateInfo: Parameters<typeof totalYupOffset>[0], storeyGlobalIds: readonly string[] = []): ViewGridAxis[] {
  const storeys = store.spatialHierarchy?.storeyElevations;
  if (!storeys || (store.entityIndex?.byType.get('IFCGRID')?.length ?? 0) === 0) return [];
  const wanted = new Set(storeyGlobalIds);
  const offset = totalYupOffset(coordinateInfo);
  const out: ViewGridAxis[] = [];
  const seen = new Set<number>();
  for (const storeyId of [...storeys.keys()].sort((x, y) => (storeys.get(x) ?? 0) - (storeys.get(y) ?? 0))) {
    if (wanted.size && !wanted.has(store.entities.getGlobalId(storeyId) ?? '')) continue;
    const plan = storeyPlanFrame(store, storeyId) ?? IDENTITY_PLAN;
    const floor = effectiveStoreyElevation(store, null, storeyId) - (coordinateInfo?.originShift?.y ?? 0);
    const toRender = (p: readonly [number, number]): Vec3 => {
      const [wx, wy] = fromStoreyLocal(plan, [p[0], p[1]]);
      return [wx - offset.x, floor, -wy - offset.z];
    };
    for (const a of extractGridAxesForStorey(store, storeyId).axes) {
      if (seen.has(a.axisId)) continue;
      seen.add(a.axisId);
      out.push({ key: `${store.entities.getGlobalId(a.gridId) || `#${a.gridId}`}:${a.AxisTag}`, tag: a.AxisTag, a: toRender(a.a), b: toRender(a.b) });
    }
  }
  return out;
}
