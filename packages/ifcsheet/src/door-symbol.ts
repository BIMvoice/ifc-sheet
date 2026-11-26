/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A door's plan symbol from its opening and its stated operation (`door-operation.ts`): the leaves, swing arcs, bars and arrows a floor plan
 * draws in the opening. `opening-symbols.ts` finds the opening and the flips; this draws what goes in it.
 */

import type { DoorOperation } from './door-operation.js';
import type { OpeningRect } from './opening-symbols.js';
import type { DraftShape, Pt } from './draft-types.js';

/** The point `su` along the opening's width and `sn` across it from its centre. */
export const at = (r: OpeningRect, su: number, sn: number): Pt => ({
  x: r.c.x + r.u.x * su + r.n.x * sn,
  y: r.c.y + r.u.y * su + r.n.y * sn,
});

/** Above this width a door read from its mesh is drawn as a pair of leaves. */
export const DOUBLE_LEAF_WIDTH = 1.4;

/** The quarter turn from the closed leaf (along `jamb`) to the open one (along `leaf`), counter-clockwise, as an arc about `hinge`. */
function swingArc(hinge: Pt, jamb: Pt, leaf: Pt, w: number): DraftShape {
  const a = Math.atan2(jamb.y, jamb.x);
  const b = Math.atan2(leaf.y, leaf.x);
  const ccw = jamb.x * leaf.y - jamb.y * leaf.x > 0;
  return { type: 'arc', c: hinge, r: w, start: ccw ? a : b, end: ccw ? b : a };
}

/** A line with an open arrowhead at `b`. */
function arrowShapes(a: Pt, b: Pt): DraftShape[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
  const head = Math.min(0.08, len / 3);
  return [
    { type: 'line', a, b },
    { type: 'polyline', closed: false, pts: [{ x: b.x - ux * head - uy * head / 2, y: b.y - uy * head + ux * head / 2 }, b, { x: b.x - ux * head + uy * head / 2, y: b.y - uy * head - ux * head / 2 }] },
  ];
}

/** A closed bar from `from` to `to` along the width, between `n0` and `n1` across it. */
const bar = (r: OpeningRect, from: number, to: number, n0: number, n1: number): DraftShape => (
  { type: 'polyline', closed: true, pts: [at(r, from, n0), at(r, to, n0), at(r, to, n1), at(r, from, n1)] }
);

/**
 * A door as a plan draws it. By default each leaf open at 90° as a thin rectangle (its thickness, drawn heavy) and its swing arc from
 * the leaf's tip back to the closed position (thin), hinged on the −u jamb and swinging to the +n side; `flips` bit 1 hinges it on the
 * other jamb, bit 2 swings it to the other side. Two leaves, one per jamb, when `op.leaves` says so, else when wider than `DOUBLE_LEAF_WIDTH`.
 * `op`, the operation the model states (IFC4.3 IfcDoorTypeOperationEnum, `door-operation.ts`), changes what a leaf draws:
 * - SINGLE_SWING_* / DOUBLE_DOOR_SINGLE_SWING: the above;
 * - SWING_FIXED_* (`op.fixedPanel`): the leaf over the half of the opening on its hinge side, and the fixed panel over the other half as a bar
 *   in the closed leaf's place, as the enum's figure draws it;
 * - DOUBLE_DOOR_SINGLE_SWING_OPPOSITE_* (`op.oppositeLeaf`): the leaf on the jamb `flips` bit 1 names swings to the leaf side, the other to
 *   the opposite side;
 * - DOUBLE_SWING_* / DOUBLE_DOOR_DOUBLE_SWING (double-acting): the same, and the swing to the other side as a dashed arc about the same hinge;
 * - SLIDING_TO_* / DOUBLE_DOOR_SLIDING: each leaf a heavy bar along the wall face, with an arrow along the wall towards the jamb it slides to;
 * - FOLDING_TO_* / DOUBLE_DOOR_FOLDING: each leaf two halves folded in a zig-zag from the jamb it stacks on;
 * - REVOLVING: a thin circle with a heavy cross, the four leaves, about the middle of the opening;
 * - REVOLVING_VERTICAL (`pivot`): the usual plan symbol of a centre-pivot door: the one leaf open at 90° across the opening through its
 *   axis in the middle, and the quarter arc each half of it sweeps, to opposite sides of the wall: the half that closes on the jamb `flips`
 *   bit 1 names to the leaf side, the other half to the other side;
 * - LIFTING_* / ROLLINGUP (overhead): each leaf a heavy bar along the wall face and the panel's retracted position as a dashed line along the
 *   middle of the opening, with no swing arc (a lifting or rolling panel swings nowhere).
 */
export function doorSymbol(r: OpeningRect, flips = 0, op?: DoorOperation): { thin: DraftShape[]; heavy: DraftShape[]; dashed: DraftShape[] } {
  const sh = flips & 1 ? 1 : -1;
  const sn = flips & 2 ? -1 : 1;
  const t = Math.min(0.05, Math.max(0.02, r.depth * 0.4));
  const thin: DraftShape[] = [], heavy: DraftShape[] = [], dashed: DraftShape[] = [];
  if (op?.motion === 'revolving') {
    const R = r.width / 2;
    thin.push({ type: 'circle', c: r.c, r: R });
    for (const d of [r.u, r.n]) heavy.push({ type: 'line', a: { x: r.c.x - d.x * R, y: r.c.y - d.y * R }, b: { x: r.c.x + d.x * R, y: r.c.y + d.y * R } });
    return { thin, heavy, dashed };
  }
  if (op?.motion === 'pivot') {
    const R = r.width / 2;
    heavy.push(bar(r, -t / 2, t / 2, -R, R));
    const toward = (su: number, sn2: number): Pt => ({ x: r.u.x * su + r.n.x * sn2, y: r.u.y * su + r.n.y * sn2 });
    thin.push(swingArc(r.c, toward(sh, 0), toward(0, sn), R), swingArc(r.c, toward(-sh, 0), toward(0, -sn), R));
    return { thin, heavy, dashed };
  }
  if (op?.motion === 'overhead') {
    // On the leaf side's wall face, as a sliding leaf is: `flips` bit 2 moves it to the other face.
    const face = sn * r.depth / 2, outer = face + sn * t;
    const parts = op.leaves === 2 ? [[-r.width / 2, 0], [0, r.width / 2]] : [[-r.width / 2, r.width / 2]];
    for (const [from, to] of parts) heavy.push(bar(r, from, to, face, outer));
    dashed.push({ type: 'line', a: at(r, -r.width / 2, 0), b: at(r, r.width / 2, 0) });
    return { thin, heavy, dashed };
  }
  const leaves = (op ? op.leaves : r.width > DOUBLE_LEAF_WIDTH ? 2 : 1) === 2 ? [sh, -sh] : [sh];
  const w = op?.fixedPanel ? r.width / 2 : r.width / leaves.length;
  if (op?.fixedPanel) heavy.push(bar(r, 0, -sh * r.width / 2, sn * r.depth / 2, sn * (r.depth / 2 - t)));
  for (const [i, side] of leaves.entries()) {
    // The side this leaf swings or lies to: the second leaf of a pair that swings opposite ways goes to the other side.
    const ln = op?.oppositeLeaf && i === 1 ? -sn : sn;
    if (op?.motion === 'sliding') {
      // The leaf along the wall face on the leaf side, spanning the width it covers, and the way it slides: towards its jamb.
      const from = side * (r.width / 2 - w), to = side * r.width / 2;
      const face = ln * r.depth / 2, outer = face + ln * t;
      heavy.push(bar(r, from, to, face, outer));
      const mid = (from + to) / 2, lane = outer + ln * 0.08;
      thin.push(...arrowShapes(at(r, mid - side * w / 4, lane), at(r, mid + side * w / 4, lane)));
      continue;
    }
    if (op?.motion === 'folding') {
      // Two halves from the jamb, folded out to the leaf side at 60° and back to the wall line: the zig-zag of a folded leaf.
      const half = w / 2;
      const foot = at(r, side * r.width / 2, ln * r.depth / 2);
      const inward = { x: -r.u.x * side, y: -r.u.y * side };
      const out = { x: r.n.x * ln, y: r.n.y * ln };
      const fold = { x: foot.x + inward.x * half * Math.cos(Math.PI / 3) + out.x * half * Math.sin(Math.PI / 3), y: foot.y + inward.y * half * Math.cos(Math.PI / 3) + out.y * half * Math.sin(Math.PI / 3) };
      const end = { x: foot.x + inward.x * half * 2 * Math.cos(Math.PI / 3), y: foot.y + inward.y * half * 2 * Math.cos(Math.PI / 3) };
      heavy.push({ type: 'polyline', closed: false, pts: [foot, fold, end] });
      continue;
    }
    const hinge = at(r, side * r.width / 2, ln * r.depth / 2);
    const leaf = { x: r.n.x * ln, y: r.n.y * ln };
    const jamb = { x: -r.u.x * side, y: -r.u.y * side };
    const tip = { x: hinge.x + leaf.x * w, y: hinge.y + leaf.y * w };
    heavy.push({ type: 'polyline', closed: true, pts: [hinge, tip, { x: tip.x + jamb.x * t, y: tip.y + jamb.y * t }, { x: hinge.x + jamb.x * t, y: hinge.y + jamb.y * t }] });
    thin.push(swingArc(hinge, jamb, leaf, w));
    if (op?.doubleActing) {
      // Swings to the other side too: the same hinge on the other wall face, the other quarter turn, dashed.
      const back = { x: -leaf.x, y: -leaf.y };
      dashed.push(swingArc(at(r, side * r.width / 2, -ln * r.depth / 2), jamb, back, w));
    }
  }
  return { thin, heavy, dashed };
}
