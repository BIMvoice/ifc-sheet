/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where a room's label goes: the point inside the room's footprint, deepest
 * from its walls (the pole of inaccessibility, found on a grid), at which the
 * whole label fits inside the footprint and clear of everything else on the
 * view. A thin or L-shaped room has its centroid in a wall or outside the
 * room; this point is always inside. Pure and deterministic.
 */

import type { Pt } from '@/drafting/types';
import type { RectIndex } from '@/labels/rect-index';
import { pointInRing, rectAround, rectHitsRing, rectInsideRing, rectsOverlap, ringBounds, type Rect } from '@/labels/label-geometry';

export interface RoomObstacles {
  /** Boxes of annotations already placed (and of labels placed before this one). */
  rects: readonly Rect[];
  /** Outlines of elements the label must not lie over (walls, doors, windows, furniture). */
  rings: readonly (readonly Pt[])[];
  /** The same boxes and outlines on a grid (`labels/rect-index.ts`), for a plan with many: asked instead of the lists, which then hold only what the grids do not. */
  rectIndex?: RectIndex;
  ringIndex?: RectIndex<readonly Pt[]>;
}

export interface RoomPoint {
  centre: Pt;
  /** Whether the whole label fits inside the room and clear of the obstacles; false: the deepest point, label too big. */
  fits: boolean;
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

const depth = (ring: readonly Pt[], p: Pt): number => Math.min(...ring.map((a, i) => distToSegment(p, a, ring[(i + 1) % ring.length])));

/** Grid step, metres: fine enough for a label in a small room, coarse enough for a hall. */
function stepFor(box: Rect, w: number, h: number): number {
  const span = Math.max(box.x1 - box.x0, box.y1 - box.y0);
  return Math.max(Math.min(w, h) / 6, span / 120, 0.02);
}

export function roomLabelPoint(ring: readonly Pt[], w: number, h: number, avoid: RoomObstacles, clear: number): RoomPoint {
  const box = ringBounds(ring);
  const step = stepFor(box, w, h);
  let best: { p: Pt; d: number } | null = null, deepest: { p: Pt; d: number } | null = null;
  for (let y = box.y0 + step / 2; y < box.y1; y += step) {
    for (let x = box.x0 + step / 2; x < box.x1; x += step) {
      const p = { x, y };
      const r = rectAround(p, w + 2 * clear, h + 2 * clear);
      // Inside the room, the deepest first; the first found (top-left-most) among equals.
      const d = depth(ring, p);
      if (!pointInRing(ring, p)) continue;
      if (!deepest || d > deepest.d + 1e-9) deepest = { p, d };
      if (best && d <= best.d + 1e-9) continue;
      if (!rectInsideRing(r, ring)) continue;
      if (avoid.rects.some((o) => rectsOverlap(r, o)) || avoid.rings.some((o) => rectHitsRing(r, o))) continue;
      if (avoid.rectIndex?.any(r)) continue;
      let onRing = false;
      avoid.ringIndex?.query(r, (_, ring2) => (onRing = rectHitsRing(r, ring2)));
      if (onRing) continue;
      best = { p, d };
    }
  }
  if (best) return { centre: best.p, fits: true };
  return { centre: deepest?.p ?? ring[0], fits: false };
}
