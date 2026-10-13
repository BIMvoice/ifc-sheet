/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A revision cloud as a drafted shape: a closed run of scallops round a
 * rectangle, each scallop a half circle bulging outward, drawn as a polyline so
 * it is an ordinary shape (it moves, deletes, exports to DXF like any other).
 * `radius` is the scallop's radius; the rectangle is the box to mark, drawing
 * units. Pure; the same box gives the same cloud.
 */

import type { Pt } from '@/drafting/types';
import type { Rect } from '@/labels/label-geometry';

/** Points along each half circle. */
const STEPS = 6;

export function cloudRing(box: Rect, radius: number): Pt[] {
  // Counter-clockwise from the lower left; outward is to the right of the walking direction.
  const corners: Pt[] = [{ x: box.x0, y: box.y0 }, { x: box.x1, y: box.y0 }, { x: box.x1, y: box.y1 }, { x: box.x0, y: box.y1 }];
  const out: Pt[] = [];
  for (let s = 0; s < 4; s++) {
    const a = corners[s], b = corners[(s + 1) % 4];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.round(len / (2 * radius)));
    const along = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const outward = { x: along.y, y: -along.x };
    const r = len / n / 2;
    for (let i = 0; i < n; i++) {
      const c = { x: a.x + along.x * (2 * i + 1) * r, y: a.y + along.y * (2 * i + 1) * r };
      for (let k = 0; k < STEPS; k++) {
        const t = Math.PI - (Math.PI * k) / STEPS;
        out.push({ x: c.x + along.x * r * Math.cos(t) + outward.x * r * Math.sin(t), y: c.y + along.y * r * Math.cos(t) + outward.y * r * Math.sin(t) });
      }
    }
  }
  return out;
}
