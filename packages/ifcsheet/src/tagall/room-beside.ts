/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where a plan's room tag goes when it fits in its room neither whole nor cut down (a shaft, a WC): just outside the room, at the
 * nearest place clear of the cut, the door swings and the annotations, with a short leader to the room's deepest point. Searched on a grid round the
 * room, no farther than twice the tag's size from its box; nearest the box first, ties to the lower y, then the lower x. Null when there is no such place. Pure and deterministic.
 */

import type { Pt } from '../draft-types.js';
import { growRect, pointInRing, rectAround, rectHitsRing, ringBounds } from '../labels/label-geometry.js';
import type { RectIndex } from '../labels/rect-index.js';

export interface BesideScene {
  /** The cut pieces and door swings the tag keeps off. */
  solid: RectIndex<readonly Pt[]>;
  /** The boxes of the annotations already placed. */
  annotations: RectIndex;
  /** A detail's area: the whole tag stands inside it. */
  crop?: { min: Pt; max: Pt };
}

export function roomLabelBeside(ring: readonly Pt[], w: number, h: number, clear: number, scene: BesideScene): Pt | null {
  const box = ringBounds(ring);
  const c = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
  const step = Math.max(Math.min(w, h) / 4, 0.02);
  const reachX = (box.x1 - box.x0) / 2 + 2 * w, reachY = (box.y1 - box.y0) / 2 + 2 * h;
  const last = Math.ceil(Math.max(reachX, reachY) / step);
  const ok = (p: Pt): boolean => {
    if (Math.abs(p.x - c.x) > reachX || Math.abs(p.y - c.y) > reachY) return false;
    const tag = rectAround(p, w, h);
    const { crop } = scene;
    if (crop && (tag.x0 < crop.min.x || tag.x1 > crop.max.x || tag.y0 < crop.min.y || tag.y1 > crop.max.y)) return false;
    // Outside the room: neither over its outline nor in it.
    if (pointInRing(ring, p) || rectHitsRing(tag, ring)) return false;
    const r = growRect(tag, clear);
    if (scene.annotations.any(r)) return false;
    let hit = false;
    scene.solid.query(r, (_, s) => (hit = rectHitsRing(r, s)));
    return !hit;
  };
  let best: { p: Pt; d: number } | null = null;
  for (let j = -last; j <= last; j++) {
    for (let i = -last; i <= last; i++) {
      const p = { x: c.x + i * step, y: c.y + j * step };
      // Distance from the room's box: what makes a leader short.
      const d = Math.hypot(Math.max(0, Math.abs(p.x - c.x) - (box.x1 - box.x0) / 2), Math.max(0, Math.abs(p.y - c.y) - (box.y1 - box.y0) / 2));
      if (best && d >= best.d - 1e-9) continue;
      if (ok(p)) best = { p, d };
    }
  }
  return best?.p ?? null;
}
