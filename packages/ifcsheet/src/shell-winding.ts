/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The winding number w at a sample point of the shell check (#74, #611), as
 * `overlapCheck` reads it: rounded, and skipped when not within 0.1 of whole.
 *
 * The reference is the float sum S of `windingOf` over every triangle of the
 * parts whose box holds the point, in part order. Each part is a closed chain
 * (every directed edge matched, `edgeCheck`), so off its surface its exact
 * winding is a whole number, and the exact w is a whole number K. K is found
 * by casting one ray per part through a hierarchy of its triangle boxes and
 * counting signed crossings. The answer is K only when both of these are proven:
 * - every triangle the ray comes near is a clean miss or a clean crossing of
 *   its interior, ahead of the point (each sign test clears a bound on its own
 *   rounding), so the count is the exact w;
 * - a bound on |S - exact w| is under 0.05. Then S rounds to K and is within
 *   0.1 of it, the reading the reference gives. Far triangles are bounded in bulk
 *   (below), near ones one by one from their own num and den.
 * Anything unproven (a point on a face, a ray grazing an edge, too few
 * triangles to be worth it, a non-finite coordinate, a surface that is not a
 * closed chain, lengths so large that a product of three can overflow) is
 * answered by S itself, summed exactly as before. So, by these bounds, the
 * reading is the reference's. Underflow is not bounded here: the weld keeps
 * distinct points at least 10 µm apart, so no product of these lengths gets near it.
 *
 * Bounds, u the unit roundoff, a, b, c the corners from the point, L a length
 * no corner of a holding part is farther than, d the point's distance to the
 * triangle, r the length of (num, den):
 * - num and den of `windingOf` are each off by at most 4096·u·|a||b||c|: about
 *   70 units by the usual running-error count, kept loose on purpose.
 * - An error e on a vector of length r turns it by at most (π/2)·e/r, so the
 *   term (the angle over 2π) moves by at most e/(4r), plus 4u for atan2 and
 *   the division, unless the turn crosses atan2's cut (num = 0, den < 0).
 * - r² = 2·(|a||b| + a·b)(|b||c| + b·c)(|c||a| + c·a), and each factor is at
 *   least d², so r ≥ √2·d³.
 * - den < 0 means a solid angle over π, so the point stands over the triangle
 *   (seen from beside it, a triangle fills under half a hemisphere) and d is
 *   its height. Solid angle ≤ area/d² then gives area ≥ π·d², so |num|, which is
 *   2·area·height, is at least 2π·d³. So the cut is out of reach while
 *   4096·u·L³ < 2π·d³, that is while L/d < 2.4e4.
 * So every triangle farther than L/R, for R below that, is off by at most
 * (4096/(4√2))·u·R³ + 4u. All n terms are charged that once, R chosen so they
 * come to 0.02 in all, and the hierarchy is walked only within L/R of the
 * point: what it finds there is bounded triangle by triangle, from its own num
 * and den. Summing n terms of size at most 1/2 adds at most γn·n/2.
 */

import { anyOverlap, type Box, type Bvh } from './shell-bvh.js';
import type { Surface } from './measured-shells.js';

/** The solid angle of triangle t seen from p, over 4π: positive from behind its winding (Van Oosterom and Strackee). */
export function windingOf(s: Surface, t: number, p: readonly number[]): number {
  const pts = s.points, tri = s.triangles;
  const i = tri[t] * 3, j = tri[t + 1] * 3, k = tri[t + 2] * 3;
  const ax = pts[i] - p[0], ay = pts[i + 1] - p[1], az = pts[i + 2] - p[2];
  const bx = pts[j] - p[0], by = pts[j + 1] - p[1], bz = pts[j + 2] - p[2];
  const cx = pts[k] - p[0], cy = pts[k + 1] - p[1], cz = pts[k + 2] - p[2];
  const la = Math.hypot(ax, ay, az), lb = Math.hypot(bx, by, bz), lc = Math.hypot(cx, cy, cz);
  // a . (b x c), spelled as `dot(a, cross(b, c))` was, so every float is the one it was.
  const num = ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  const den = la * lb * lc + (ax * bx + ay * by + az * bz) * lc + (bx * cx + by * cy + bz * cz) * la + (cx * ax + cy * ay + cz * az) * lb;
  return Math.atan2(num, den) / (2 * Math.PI);
}

export const holds = (b: Box, x: number, y: number, z: number, tol: number): boolean =>
  x >= b[0] - tol && x <= b[3] + tol && y >= b[1] - tol && y <= b[4] + tol && z >= b[2] - tol && z <= b[5] + tol;

const U = 2 ** -53;
const NUM_DEN = 4096 * U;
/** One far term, per R³. */
const FAR_TERM = (NUM_DEN / (4 * Math.SQRT2));
/** What all the far terms together may cost. */
const FAR_BUDGET = 0.02;
const MAX_RATIO = 1e4;
const BUDGET = 0.05;
/** Past this (L² of 1e60 m) a product of three lengths can overflow a double, and the relative bounds here stop holding. */
const MAX_FAR2 = 1e120;
/** Below this many terms the plain sum is used: there is little to save. */
export const MIN_TERMS = 32;
/** The ray's size on each axis: no axis, no diagonal, and never zero, so the slab test never divides by zero. */
const RX = 0.5381, RY = 0.6276, RZ = 0.5623;
/** Each sign test's rounding bound, per unit of its 1-norm product: the triple product has 6 monomials, 64u covers them. */
const SIGN = 64 * U;

export interface WindingInput {
  s: Surface;
  /** Part ids in the reference's order; everything else is indexed by position here. */
  ids: readonly number[];
  byPart: ReadonlyMap<number, readonly number[]>;
  boxes: readonly Box[];
  parts: Bvh;
  /** The hierarchy over part j's triangles; item q is the triangle at `byPart.get(ids[j])[q]`. */
  tree: (j: number) => Bvh;
  tol: number;
  /** The largest coordinate of any point, in absolute value. */
  reach: number;
  /** Every directed edge is matched by as many reversed: off the surface w is whole only then, and a count can stand in for it. */
  closed: boolean;
}

/** w at a point as the reference reads it: a whole K when proven, else the reference sum itself. */
export function windingField(input: WindingInput, minTerms = MIN_TERMS): (x: number, y: number, z: number) => number {
  const { s, ids, byPart, boxes, parts, tol } = input;
  const provable = input.closed && s.points.every((v) => Number.isFinite(v)) && Number.isFinite(tol);
  const holding: number[] = [];
  return (x, y, z) => {
    holding.length = 0;
    // 4·tol around the point: wider than `holds` reaches (tol, past rounding), so every holding part is visited.
    const m = 4 * tol;
    anyOverlap(parts, x - m, y - m, z - m, x + m, y + m, z + m, (j) => {
      if (holds(boxes[j], x, y, z, tol)) holding.push(j);
      return false;
    });
    holding.sort((a, b) => a - b);
    let n = 0;
    for (const j of holding) n += byPart.get(ids[j])!.length;
    if (provable && n > 0 && n >= minTerms) {
      const k = proven(input, holding, x, y, z, n);
      if (k !== null) return k;
    }
    const at3 = [x, y, z];
    let w = 0;
    for (const j of holding) for (const u of byPart.get(ids[j])!) w += windingOf(s, u, at3);
    return w;
  };
}

/** K when the count and the error bound are both proven, else null. */
function proven(input: WindingInput, holding: readonly number[], x: number, y: number, z: number, n: number): number | null {
  let k = 0;
  for (const j of holding) {
    const c = rayCount(input, j, x, y, z);
    if (c === null) return null;
    k += c;
  }
  const nu = n * U;
  if (nu >= 0.5) return null;
  return errorBound(input, holding, x, y, z, n, ((nu / (1 - nu)) * n) / 2) < BUDGET ? k : null;
}

const sign = (v: number, e: number): number => (v > e ? 1 : v < -e ? -1 : 0);

/**
 * The signed crossings of a ray from (x, y, z) with part j's triangles; null when any is not clean. The ray leaves the
 * part's box by the nearest way on each axis: the shorter it is, the fewer boxes it enters.
 */
function rayCount(input: WindingInput, part: number, x: number, y: number, z: number): number | null {
  const { s: { points: pts, triangles: tri }, boxes, ids, byPart } = input;
  const t = input.tree(part), list = byPart.get(ids[part])!, bx = t.box, stack = t.stack;
  const pb = boxes[part];
  const sx = pb[3] - x <= x - pb[0] ? 1 : -1, sy = pb[4] - y <= y - pb[1] ? 1 : -1, sz = pb[5] - z <= z - pb[2] ? 1 : -1;
  const rx = sx * RX, ry = sy * RY, rz = sz * RZ;
  // Wider than any rounding of the slab test by orders of magnitude, so a grazed triangle is visited and found not clean.
  const pad = 1e-9 * (1 + input.reach + Math.abs(x) + Math.abs(y) + Math.abs(z));
  // Which bound of a node the ray reaches first on each axis, then last.
  const x0 = sx > 0 ? 0 : 3, y0 = sy > 0 ? 1 : 4, z0 = sz > 0 ? 2 : 5, x1 = 3 - x0, y1 = 5 - y0, z1 = 7 - z0;
  const r1 = SIGN * (RX + RY + RZ);
  let k = 0;
  let top = 0;
  stack[top++] = 0;
  while (top > 0) {
    const node = stack[--top];
    const b = node * 6;
    const t0 = Math.max((sx * (bx[b + x0] - x) - pad) / RX, (sy * (bx[b + y0] - y) - pad) / RY, (sz * (bx[b + z0] - z) - pad) / RZ);
    const t1 = Math.min((sx * (bx[b + x1] - x) + pad) / RX, (sy * (bx[b + y1] - y) + pad) / RY, (sz * (bx[b + z1] - z) + pad) / RZ);
    if (!(t1 >= 0 && t0 <= t1)) continue;
    if (t.right[node] >= 0) { stack[top++] = t.right[node]; stack[top++] = node + 1; continue; }
    for (let q = t.start[node], end = q + t.count[node]; q < end; q++) {
      const tr = list[t.items[q]];
      const i = tri[tr] * 3, j = tri[tr + 1] * 3, l = tri[tr + 2] * 3;
      const ax = pts[i] - x, ay = pts[i + 1] - y, az = pts[i + 2] - z;
      const ux = pts[j] - x, uy = pts[j + 1] - y, uz = pts[j + 2] - z;
      const cx = pts[l] - x, cy = pts[l + 1] - y, cz = pts[l + 2] - z;
      const na = Math.abs(ax) + Math.abs(ay) + Math.abs(az), nb = Math.abs(ux) + Math.abs(uy) + Math.abs(uz), nc = Math.abs(cx) + Math.abs(cy) + Math.abs(cz);
      const g1 = sign(rx * (ay * uz - az * uy) + ry * (az * ux - ax * uz) + rz * (ax * uy - ay * ux), r1 * na * nb);
      const g2 = sign(rx * (uy * cz - uz * cy) + ry * (uz * cx - ux * cz) + rz * (ux * cy - uy * cx), r1 * nb * nc);
      // Two clean opposite signs: the line passes outside the triangle.
      if (g1 * g2 < 0) continue;
      const g3 = sign(rx * (cy * az - cz * ay) + ry * (cz * ax - cx * az) + rz * (cx * ay - cy * ax), r1 * nc * na);
      if (g2 * g3 < 0 || g3 * g1 < 0) continue;
      if (g1 === 0 || g2 === 0 || g3 === 0) return null;
      const vol = sign(ax * (uy * cz - uz * cy) + ay * (uz * cx - ux * cz) + az * (ux * cy - uy * cx), SIGN * na * nb * nc);
      if (vol === 0) return null;
      // Ahead of the point when the plane is on the side the ray faces; leaving through the front of the winding counts +1.
      if (vol === g1) k += g1;
    }
  }
  return k;
}

/** The last R and the term count it was made for: consecutive points nearly always hold the same parts. */
let ratioFor = -1, ratioOf = 0;

/** R for n terms: every triangle farther than L/R may be charged in bulk, and all n such charges come to `FAR_BUDGET`. */
export function farRatio(n: number): number {
  if (n !== ratioFor) { ratioFor = n; ratioOf = Math.min(MAX_RATIO, Math.cbrt(FAR_BUDGET / (n * FAR_TERM))); }
  return ratioOf;
}

/** A bound on |reference sum - exact w| at the point, `start` (the summation term) included; Infinity once past the budget. */
export function errorBound(input: WindingInput, holding: readonly number[], x: number, y: number, z: number, n: number, start: number): number {
  const { s: { points: pts, triangles: tri }, boxes, ids, byPart } = input;
  // The farthest corner of the holding parts' boxes, past rounding.
  let far2 = 0;
  for (const j of holding) {
    const b = boxes[j];
    const fx = Math.max(x - b[0], b[3] - x), fy = Math.max(y - b[1], b[4] - y), fz = Math.max(z - b[2], b[5] - z);
    const f = fx * fx + fy * fy + fz * fz;
    if (f > far2) far2 = f;
  }
  if (!(far2 < MAX_FAR2)) return Infinity;
  const ratio = farRatio(n);
  if (!(ratio > 1)) return Infinity;
  // Squared reach of the walk: a little over (L/R)², so a box left out is farther than L/R however the squares round.
  const reach2 = (far2 / (ratio * ratio)) * (1 + 1e-6);
  let e = start + n * (FAR_TERM * ratio * ratio * ratio + 4 * U);
  if (!(e < BUDGET)) return Infinity;
  for (const part of holding) {
    const t = input.tree(part), list = byPart.get(ids[part])!, bx = t.box, stack = t.stack;
    let top = 0;
    stack[top++] = 0;
    while (top > 0) {
      const node = stack[--top];
      const b = node * 6;
      const nx = bx[b] > x ? bx[b] - x : x > bx[b + 3] ? x - bx[b + 3] : 0;
      const ny = bx[b + 1] > y ? bx[b + 1] - y : y > bx[b + 4] ? y - bx[b + 4] : 0;
      const nz = bx[b + 2] > z ? bx[b + 2] - z : z > bx[b + 5] ? z - bx[b + 5] : 0;
      if (nx * nx + ny * ny + nz * nz > reach2) continue;
      if (t.right[node] >= 0) {
        stack[top++] = t.right[node];
        stack[top++] = node + 1;
        continue;
      }
      for (let q = t.start[node], end = q + t.count[node]; q < end; q++) {
        const tr = list[t.items[q]];
        const i = tri[tr] * 3, j = tri[tr + 1] * 3, l = tri[tr + 2] * 3;
        const ax = pts[i] - x, ay = pts[i + 1] - y, az = pts[i + 2] - z;
        const ux = pts[j] - x, uy = pts[j + 1] - y, uz = pts[j + 2] - z;
        const cx = pts[l] - x, cy = pts[l + 1] - y, cz = pts[l + 2] - z;
        const la = Math.sqrt(ax * ax + ay * ay + az * az), lb = Math.sqrt(ux * ux + uy * uy + uz * uz), lc = Math.sqrt(cx * cx + cy * cy + cz * cz);
        const err = NUM_DEN * la * lb * lc * (1 + 1e-9);
        // Not the floats `windingOf` gets (it uses Math.hypot), but within `err` of the exact num and den as they are, so
        // the reference's own num and den are within 2·err of these: the disc checked here holds them, and the cut must not touch it.
        const num = ax * (uy * cz - uz * cy) + ay * (uz * cx - ux * cz) + az * (ux * cy - uy * cx);
        const den = la * lb * lc + (ax * ux + ay * uy + az * uz) * lc + (ux * cx + uy * cy + uz * cz) * la + (cx * ax + cy * ay + cz * az) * lb;
        const r = Math.sqrt(num * num + den * den);
        if (!(r > 3 * err) || (Math.abs(num) <= 2 * err && den < 2 * err)) return Infinity;
        e += err / (4 * (r - err)) + 4 * U;
      }
      if (!(e < BUDGET)) return Infinity;
    }
  }
  return e;
}
