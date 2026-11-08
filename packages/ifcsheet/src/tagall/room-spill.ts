/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where a room's tag goes when it is too big for its room: nearest the room's deepest point, within or just outside the room,
 * at a place clear of the texts and symbols already drawn (the boxes the door and window tags keep clear of), with a short
 * leader to the deepest point when the tag no longer covers it. The deepest point itself when nothing is drawn there, as before. Null when no such place exists within about a tag's size of the room. Pure and
 * deterministic.
 */

import type { Pt } from '../draft-types.js';
import { pointInRing, rectAround, rectHitsRing, ringBounds } from '../labels/label-geometry.js';
import type { RectIndex } from '../labels/rect-index.js';

export interface RoomSpill {
  centre: Pt;
  /** Where the leader ends, inside the room; absent when the tag stands over that point. */
  tip?: Pt;
}

export function roomLabelSpill(
  ring: readonly Pt[], w: number, h: number, deepest: Pt,
  texts: RectIndex, clear: number,
): RoomSpill | null {
  const box = ringBounds(ring);
  const reach = Math.max(w, h);
  const step = Math.max(Math.min(w, h) / 6, (box.x1 - box.x0 + box.y1 - box.y0) / 240, 0.02);
  const cands: { c: Pt; d: number }[] = [{ c: deepest, d: 0 }];
  for (let y = box.y0 - reach; y <= box.y1 + reach; y += step) {
    for (let x = box.x0 - reach; x <= box.x1 + reach; x += step) cands.push({ c: { x, y }, d: Math.hypot(x - deepest.x, y - deepest.y) });
  }
  cands.sort((a, b) => a.d - b.d || a.c.y - b.c.y || a.c.x - b.c.x);
  for (const { c } of cands) {
    const r = rectAround(c, w + 2 * clear, h + 2 * clear);
    if (texts.any(r)) continue;
    // The tag must touch the room, or its leader would run through other rooms.
    if (!pointInRing(ring, c) && !rectHitsRing(rectAround(c, w, h), ring)) continue;
    return { centre: c, tip: tipFor(ring, c, w, h, deepest, texts, step) };
  }
  return null;
}

/** Where the leader ends: the point of the room nearest the tag that no text covers (the deepest point when nothing is nearer), none when the tag stands over it. */
function tipFor(ring: readonly Pt[], c: Pt, w: number, h: number, deepest: Pt, texts: RectIndex, step: number): Pt | undefined {
  const over = (p: Pt) => p.x >= c.x - w / 2 && p.x <= c.x + w / 2 && p.y >= c.y - h / 2 && p.y <= c.y + h / 2;
  if (over(deepest) && !texts.any(rectAround(deepest, 0.02, 0.02))) return undefined;
  const box = ringBounds(ring);
  const gap = Math.max(step, (box.x1 - box.x0 + box.y1 - box.y0) / 60);
  let best: Pt | null = null, d = Infinity;
  for (let y = box.y0 + gap / 2; y < box.y1; y += gap) {
    for (let x = box.x0 + gap / 2; x < box.x1; x += gap) {
      const p = { x, y };
      const dist = Math.hypot(x - c.x, y - c.y);
      if (dist < d && pointInRing(ring, p) && !texts.any(rectAround(p, gap, gap))) { best = p; d = dist; }
    }
  }
  return best && !over(best) ? best : best ? undefined : deepest;
}
