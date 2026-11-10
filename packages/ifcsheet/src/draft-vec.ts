/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The angle and rotation helpers the symbols (`symbols.ts`) are placed with; the app's `drafting/vec.ts` re-exports them. */

import type { Pt } from './draft-types.js';

/** Numerical tolerance for math comparisons. */
export const EPS = 1e-9;
export const TAU = Math.PI * 2;

export function rotatePt(p: Pt, center: Pt, angle: number): Pt {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return { x: center.x + dx * c - dy * s, y: center.y + dx * s + dy * c };
}

/** Normalise an angle into [0, 2π). */
export function normAngle(a: number): number {
  const r = a % TAU;
  const n = r < 0 ? r + TAU : r;
  return n >= TAU ? 0 : n;
}

/** CCW sweep from `start` to `end`, in (0, 2π]. Equal angles mean a full turn. */
export function sweepOf(start: number, end: number): number {
  const s = normAngle(end - start);
  return s < EPS ? TAU : s;
}

/** Point on a circle at a given angle. */
export function polar(c: Pt, r: number, a: number): Pt {
  return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) };
}
