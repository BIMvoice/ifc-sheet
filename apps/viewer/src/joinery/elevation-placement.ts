/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A door's or window's elevation symbol (`symbols.ts`: frame, panels and the
 * opening marks) put where the element is on an elevation or section view
 * looking at its face: the element's axes come from the mesh's
 * `localToWorld` as in `plan-placement.ts`, its centre and sill from the
 * mesh. The marks are solid where a panel opens towards the viewer and
 * dashed where it opens away, so the side the view sees it from decides.
 */

import { flipPoint, type JoinerySpec, type PanelOperation } from '@ifc-lite/create';
import type { DoorOperation } from '@bimvoice/ifcsheet';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { worldToDrawing } from '@/drafting/frame';
import type { DraftShape } from '@/drafting/types';
import { elevationSymbol, openingMarks, type OpeningConvention } from './symbols';

type V3 = [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function unit(v: V3): V3 | null {
  const l = Math.hypot(v[0], v[1], v[2]);
  return l > 1e-9 ? [v[0] / l, v[1] / l, v[2] / l] : null;
}

const AXIS: Record<'x' | 'y' | 'z', V3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

/** The world direction towards the viewer of a cardinal elevation / section (`worldToDrawing` with the screen's signs). */
function towardViewer(plane: SectionPlaneConfig): V3 | null {
  if (plane.customPlane || plane.axis === 'y') return null;
  const u = plane.axis === 'x' ? AXIS.z : AXIS.x;
  // Screen right: drawing x (±u), mirrored on screen for side views (`screenSigns`); screen up: world y.
  const sign = (plane.flipped ? -1 : 1) * (plane.axis === 'x' ? -1 : 1);
  return cross([u[0] * sign, u[1] * sign, u[2] * sign], AXIS.y);
}

export interface ElevationPlacementOptions {
  convention?: OpeningConvention;
}

/** `world`: the element's vertices (flat x, y, z, renderer frame); `flips`: how its body is turned in its opening. */
export function typedElevationSymbol(
  spec: JoinerySpec, world: readonly number[], localToWorld: readonly number[], plane: SectionPlaneConfig, flips = 0,
  options: ElevationPlacementOptions = {},
): { thin: DraftShape[]; dashed: DraftShape[] } | null {
  const toViewer = towardViewer(plane);
  const m = localToWorld;
  const ex = unit([m[0], m[4], m[8]]);
  const ez = unit([-m[2], -m[6], -m[10]]);
  const up = unit([m[1], m[5], m[9]]);
  if (!toViewer || !ex || !ez || !up || Math.abs(up[1]) < 0.99) return null;
  // Only an element whose face the view looks at (not one seen edge-on).
  const facing = dot(ez, toViewer);
  if (Math.abs(facing) < 0.9) return null;
  let minA = Infinity, maxA = -Infinity, minC = Infinity;
  for (let i = 0; i + 2 < world.length; i += 3) {
    const v: V3 = [world[i], world[i + 1], world[i + 2]];
    const a = dot(v, ex), c = dot(v, up);
    minA = Math.min(minA, a); maxA = Math.max(maxA, a);
    minC = Math.min(minC, c);
  }
  if (!Number.isFinite(minA)) return null;
  // The type frame's +y is the exterior; the element's flips may turn it.
  const [fx, fy] = flipPoint(0, 1, flips);
  const exterior = (fy * facing + fx * dot(ex, toViewer)) > 0;
  // A body turned left-right mirrors its marks along the width.
  const [mx] = flipPoint(1, 0, flips);
  const strokes = elevationSymbol(spec, { side: exterior ? 'exterior' : 'interior', convention: options.convention });
  const mid = (minA + maxA) / 2;
  const toDrawing = (p: { x: number; y: number }) => {
    // `elevationSymbol` mirrors an exterior view itself; the world placement mirrors again, so undo it here.
    const x = (exterior ? -p.x : p.x) * mx + mid;
    const z = p.y + minC;
    const w: V3 = [ex[0] * x + up[0] * z, ex[1] * x + up[1] * z, ex[2] * x + up[2] * z];
    return worldToDrawing(plane, { x: w[0], y: w[1], z: w[2] });
  };
  const out = { thin: [] as DraftShape[], dashed: [] as DraftShape[] };
  for (const s of strokes) {
    const shape: DraftShape = { type: 'polyline', pts: s.pts.map(toDrawing), closed: !!s.closed };
    (s.dashed ? out.dashed : out.thin).push(shape);
  }
  return out;
}

/**
 * The opening symbol of a door that has no configured type but a stated operation (IFC4.3 IfcDoorTypeOperationEnum, `door-operation.ts`),
 * on the door as the view sees it: the same marks a configured door gets (`openingMarks`), in the drawing's own frame, so the hinge side
 * is where the door's placement puts it as the viewer sees it, a mirrored placement included. Swing marks are solid where the leaf opens
 * towards the viewer (a leaf opens to the placement's +Y) and dashed where it opens away; `flips` (bit 1 the hand, bit 2 the swing side)
 * turn them as they turn the plan symbol. A pair of leaves is a mark in each half, hinged (or sliding or folding) outwards; a revolving door
 * has no opening lines. Which way the lines point is the project's opening-line convention.
 */
export function statedDoorElevationSymbol(
  op: DoorOperation, world: readonly number[], localToWorld: readonly number[], plane: SectionPlaneConfig, flips = 0,
  options: ElevationPlacementOptions = {},
): { thin: DraftShape[]; dashed: DraftShape[] } | null {
  if (op.motion === 'revolving') return null;
  const toViewer = towardViewer(plane);
  const m = localToWorld;
  const ex = unit([m[0], m[4], m[8]]);
  const ez = unit([-m[2], -m[6], -m[10]]);
  const up = unit([m[1], m[5], m[9]]);
  if (!toViewer || !ex || !ez || !up || Math.abs(up[1]) < 0.99 || Math.abs(dot(ez, toViewer)) < 0.9) return null;
  const to = (x: number, y: number, z: number) => worldToDrawing(plane, { x, y, z });
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i + 2 < world.length; i += 3) {
    const p = to(world[i], world[i + 1], world[i + 2]);
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  const o = to(0, 0, 0), e = to(ex[0], ex[1], ex[2]);
  if (!Number.isFinite(x0) || Math.abs(e.x - o.x) < 0.5) return null;
  // Local -X is the viewer's left when the placement's X runs to the drawing's right.
  const localLeftIsLeft = e.x > o.x;
  const named = op.hinge ?? op.towards;
  const seen = (side: 'left' | 'right'): 'left' | 'right' => ((side === 'left') === localLeftIsLeft) === !(flips & 1) ? 'left' : 'right';
  const opensToViewer = (dot(ez, toViewer) > 0) !== !!(flips & 2);
  const dashed = !opensToViewer && !op.doubleActing;
  const markOf = (side: 'left' | 'right'): PanelOperation => (
    op.motion === 'sliding' ? `door-sliding-${side}` : op.motion === 'folding' ? `folding-${side}` : op.doubleActing ? `double-acting-${side}` : `swing-${side}`
  );
  const xm = (x0 + x1) / 2;
  const cells = op.leaves === 2
    ? [{ x0, x1: xm, z0: y0, z1: y1, side: 'left' as const }, { x0: xm, x1, z0: y0, z1: y1, side: 'right' as const }]
    : [{ x0, x1, z0: y0, z1: y1, side: seen(named ?? 'left') }];
  const out = { thin: [] as DraftShape[], dashed: [] as DraftShape[] };
  for (const { side, ...cell } of cells) {
    for (const s of openingMarks(markOf(side), cell, dashed, options.convention)) {
      const shape: DraftShape = { type: 'polyline', pts: s.pts, closed: !!s.closed };
      (s.dashed ? out.dashed : out.thin).push(shape);
    }
  }
  return out;
}
