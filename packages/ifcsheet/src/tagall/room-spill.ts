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

/** What else a moved tag respects. */
export interface SpillLimits {
  /** A detail's area: the whole tag stands inside it. */
  crop?: { min: Pt; max: Pt };
  /** The cut walls: a moved tag does not stand over one. */
  walls?: RectIndex<readonly Pt[]>;
}

export function roomLabelSpill(
  ring: readonly Pt[], w: number, h: number, deepest: Pt,
  texts: RectIndex, clear: number, limits: SpillLimits = {},
): RoomSpill | null {
  const box = ringBounds(ring);
  const reach = Math.max(w, h);
  const step = Math.max(Math.min(w, h) / 6, (box.x1 - box.x0 + box.y1 - box.y0) / 240, 0.02);
  const { crop, walls } = limits;
  const inCrop = (c: Pt): boolean => {
    const tag = rectAround(c, w, h);
    return !crop || (tag.x0 >= crop.min.x && tag.x1 <= crop.max.x && tag.y0 >= crop.min.y && tag.y1 <= crop.max.y);
  };
  const ok = (c: Pt): boolean => {
    const tag = rectAround(c, w, h);
    if (!inCrop(c)) return false;
    if (texts.any(rectAround(c, w + 2 * clear, h + 2 * clear))) return false;
    // The tag must touch the room, or its leader would run through other rooms.
    if (!pointInRing(ring, c) && !rectHitsRing(tag, ring)) return false;
    let onWall = false;
    walls?.query(tag, (_b, wall) => { if (rectHitsRing(tag, wall)) { onWall = true; return true; } });
    return !onWall;
  };
  const found = (c: Pt): RoomSpill => ({ centre: c, tip: tipFor(ring, c, w, h, deepest, texts, step) });
  // The deepest point itself when nothing is drawn there, as before.
  if (!texts.any(rectAround(deepest, w + 2 * clear, h + 2 * clear)) && inCrop(deepest)) return found(deepest);
  // Else the nearest clear place, searched in square rings of growing distance round the deepest point; a ring nearer than the best
  // found so far is still searched (a corner of a ring is farther than the middle of the next), and ties go to the lower y, then the lower x.
  const last = Math.ceil((Math.max(box.x1 - box.x0, box.y1 - box.y0) + 2 * reach) / step);
  let best: { c: Pt; d: number } | null = null;
  for (let m = 1; m <= last + 1; m++) {
    if (best && m * step > best.d) break;
    for (const [i, j] of ringOffsets(m)) {
      const c = { x: deepest.x + i * step, y: deepest.y + j * step };
      const d = Math.hypot(i, j) * step;
      if (best && (d > best.d || (d === best.d && (c.y > best.c.y || (c.y === best.c.y && c.x >= best.c.x))))) continue;
      if (ok(c)) best = { c, d };
    }
  }
  return best ? found(best.c) : null;
}

/** The grid offsets at Chebyshev distance m from the origin. */
function ringOffsets(m: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = -m; i <= m; i++) out.push([i, -m], [i, m]);
  for (let j = -m + 1; j < m; j++) out.push([-m, j], [m, j]);
  return out;
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
