/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */


/** Flip a dimension to the other side of the measured segment (#491): its line and its text, mirrored across the segment's middle, perpendicular to the line. */

import type { AnnotationShape, Pt } from './types';

type DimensionShape = Extract<AnnotationShape, { type: 'dimension' }>;

export function flipDimensionSide(shape: DimensionShape): DimensionShape {
  const mid = { x: (shape.a.x + shape.b.x) / 2, y: (shape.a.y + shape.b.y) / 2 };
  // The line's direction as the layout takes it: along the segment, or (linear) the axis it was pulled along.
  let dx: number, dy: number;
  if (shape.variant === 'aligned') {
    const len = Math.hypot(shape.b.x - shape.a.x, shape.b.y - shape.a.y) || 1;
    dx = (shape.b.x - shape.a.x) / len; dy = (shape.b.y - shape.a.y) / len;
  } else if (Math.abs(shape.at.y - mid.y) >= Math.abs(shape.at.x - mid.x)) { dx = 1; dy = 0; } else { dx = 0; dy = 1; }
  const n = { x: -dy, y: dx };
  const mirror = (p: Pt): Pt => {
    const off = (p.x - mid.x) * n.x + (p.y - mid.y) * n.y;
    return { x: p.x - 2 * off * n.x, y: p.y - 2 * off * n.y };
  };
  return { ...shape, at: mirror(shape.at), ...(shape.textAt ? { textAt: mirror(shape.textAt) } : {}) };
}
