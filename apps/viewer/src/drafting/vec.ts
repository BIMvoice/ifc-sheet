/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * 2D vector helpers for the drafting kernel. Points and vectors share the
 * `Pt` shape; every helper is pure and allocates a fresh result.
 */

import { EPS, TAU, normAngle, polar, rotatePt, sweepOf } from '@bimvoice/ifcsheet';
import type { Pt } from './types';

export { EPS, TAU, normAngle, polar, rotatePt, sweepOf };

/** Points closer than this (metres) are treated as coincident. */
export const COINCIDENT = 1e-6;
/**
 * How far (metres, the drawing's model units) the spans of a dimension chain may stray from one line and still be one chain: 5 mm,
 * so that snapped points a millimetre or two off line (walls not perfectly in line) are still the chain they were drawn as.
 */
export const CHAIN_TOLERANCE = 0.005;

export function pt(x: number, y: number): Pt {
  return { x, y };
}

export function add(a: Pt, b: Pt): Pt {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Pt, b: Pt): Pt {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Pt, k: number): Pt {
  return { x: a.x * k, y: a.y * k };
}

export function dot(a: Pt, b: Pt): number {
  return a.x * b.x + a.y * b.y;
}

/** z-component of the 3D cross product (positive when b is CCW of a). */
export function cross(a: Pt, b: Pt): number {
  return a.x * b.y - a.y * b.x;
}

export function len(a: Pt): number {
  return Math.hypot(a.x, a.y);
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Unit vector; returns (0,0) for a zero-length input. */
export function norm(a: Pt): Pt {
  const l = len(a);
  return l < EPS ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

/** Left-hand perpendicular (rotated +90°). */
export function perp(a: Pt): Pt {
  return { x: -a.y, y: a.x };
}

/** Reflect `p` across the infinite line through `a` and `b`. */
export function mirrorPt(p: Pt, a: Pt, b: Pt): Pt {
  const d = sub(b, a);
  const l2 = dot(d, d);
  if (l2 < EPS * EPS) {
    // Degenerate axis: reflect through the point `a`.
    return { x: 2 * a.x - p.x, y: 2 * a.y - p.y };
  }
  const t = dot(sub(p, a), d) / l2;
  const foot = add(a, scale(d, t));
  return { x: 2 * foot.x - p.x, y: 2 * foot.y - p.y };
}

export function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function angleOf(v: Pt): number {
  return Math.atan2(v.y, v.x);
}

/** True when `angle` lies on the CCW sweep from `start` to `end` (inclusive). */
export function angleInArc(angle: number, start: number, end: number, tol = EPS): boolean {
  const sw = sweepOf(start, end);
  const off = normAngle(angle - start);
  if (off <= sw + tol) return true;
  // Wrap-around tolerance just before `start`.
  return TAU - off <= tol;
}

export function samePt(a: Pt, b: Pt, tol = COINCIDENT): boolean {
  return dist(a, b) <= tol;
}
