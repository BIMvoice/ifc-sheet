/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where a room's label goes when no place is clear of the lines the drawing shows (a section's room, crowded by a stair and a
 * window): the place inside the room, clear of the annotations, that lies over the fewest of them, the deepest of those.
 * Pure and deterministic, like `roomLabelPoint`, which is tried first.
 */

import type { Pt } from '@/drafting/types';
import { rectAround, rectInsideRing, rectsOverlap, ringBounds, type Rect } from '@/labels/label-geometry';
import type { RectIndex } from '@/labels/rect-index';

export function roomLabelPointLeast(ring: readonly Pt[], w: number, h: number, lines: readonly Rect[], annotations: RectIndex): { centre: Pt; over: number } | null {
  const box = ringBounds(ring);
  const step = Math.max(Math.min(w, h) / 6, Math.max(box.x1 - box.x0, box.y1 - box.y0) / 120, 0.02);
  let best: { centre: Pt; over: number; depth: number } | null = null;
  for (let y = box.y0 + step / 2; y < box.y1; y += step) {
    for (let x = box.x0 + step / 2; x < box.x1; x += step) {
      const r = rectAround({ x, y }, w, h);
      if (!rectInsideRing(r, ring) || annotations.any(r)) continue;
      let over = 0;
      for (const l of lines) if (rectsOverlap(r, l)) over++;
      const depth = Math.min(x - box.x0, box.x1 - x, y - box.y0, box.y1 - y);
      if (!best || over < best.over || (over === best.over && depth > best.depth + 1e-9)) best = { centre: { x, y }, over, depth };
    }
  }
  return best ? { centre: best.centre, over: best.over } : null;
}
