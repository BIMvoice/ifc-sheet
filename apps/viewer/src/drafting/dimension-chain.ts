/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Continuous dimensions: each dimension after the first starts where the
 * previous one ended and sits on the previous one's dimension line, so a
 * chain of them reads as one string. Only the next point is asked for.
 */

import { dimensionLayout } from './annotation';
import type { AnnotationShape, Pt } from './types';
import { COINCIDENT, add, cross, dist, dot, norm, perp, scale, sub } from './vec';

/** Beyond this sine between the two spans an aligned chain has turned a corner (about 30 degrees). */
const CORNER_SIN = 0.5;

export type DimensionShape = Extract<AnnotationShape, { type: 'dimension' }>;

/**
 * The dimension that continues `prev` to `next`: from `prev.b` to `next`, same
 * variant, its line on the same infinite line as `prev`'s (at the new span's
 * midpoint, so a linear dimension keeps its horizontal / vertical sense).
 * `null` when `next` coincides with `prev.b`, or `prev` has no length.
 */
export function continueDimension(prev: DimensionShape, next: Pt): DimensionShape | null {
  const line = dimensionLayout(prev).lines[2];
  if (!line || dist(prev.b, next) < COINCIDENT || dist(line.a, line.b) < COINCIDENT) return null;
  const along = scale(sub(line.b, line.a), 1 / dist(line.a, line.b));
  const n = { x: -along.y, y: along.x };
  const mid = scale(add(prev.b, next), 0.5);
  if (prev.variant === 'aligned') {
    const d1 = norm(sub(prev.b, prev.a));
    const d2 = norm(sub(next, prev.b));
    if (Math.abs(cross(d1, d2)) > CORNER_SIN) {
      // A span at a corner cannot share the previous line: it would collapse onto
      // the measured edge. Carry the previous offset over, on the same side.
      const offset = dot(sub(prev.at, scale(add(prev.a, prev.b), 0.5)), perp(d1));
      return { type: 'dimension', variant: 'aligned', a: prev.b, b: next, at: add(mid, scale(perp(d2), offset)), height: prev.height };
    }
  }
  const at = add(mid, scale(n, dot(sub(line.a, mid), n)));
  // `text` / `textAt` belong to the one dimension they were set on.
  return { type: 'dimension', variant: prev.variant, a: prev.b, b: next, at, height: prev.height };
}
