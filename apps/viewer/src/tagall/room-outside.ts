/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where a section's room tag goes when no place inside the room is clear of the lines the drawing shows (#677): outside the
 * room, in the nearest free space, with a short leader into the room. Above the room's cut and inside the drawing first, else
 * just outside the drawing's bounds on the nearer side. The tag crosses no line; the leader crosses only the lines that
 * bound the room (it has to enter it) and ends at a point inside the room's cut that no line touches. Pure and deterministic.
 */

import type { Pt } from '@/drafting/types';
import { nearestOnRing, pointInRing, rectAround, ringBounds, type LeaderRect as Rect } from '@bimvoice/ifcsheet';
import { RectIndex } from '@bimvoice/ifcsheet';

/** A drawing's visible lines and the box that holds the drawing. */
export interface OutsideScene {
  bounds: Rect;
  lines: readonly { a: Pt; b: Pt }[];
}

/** How far from the room's outline a line may be crossed by the leader and still be one of the lines that bound the room: the wall or slab it enters through, metres. */
export const ENTRY_BAND = 0.35;

/** Whether the segment a-b passes through the rectangle. */
export function segmentHitsRect(r: Rect, a: Pt, b: Pt): boolean {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - r.x0], [dx, r.x1 - a.x], [-dy, a.y - r.y0], [dy, r.y1 - a.y]] as const) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

/** Where the segments a-b and c-d cross, or null. */
export function crossing(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den, u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { x: a.x + t * r.x, y: a.y + t * r.y } : null;
}

/** The lines of a scene on a grid, so that a box or a leader is tested against the lines near it, not against every line of the drawing. */
const grids = new WeakMap<OutsideScene['lines'], RectIndex<number>>();
function gridOf(lines: OutsideScene['lines']): RectIndex<number> {
  let g = grids.get(lines);
  if (!g) {
    g = new RectIndex<number>(0.5);
    lines.forEach((l, i) => g!.add({ x0: Math.min(l.a.x, l.b.x), y0: Math.min(l.a.y, l.b.y), x1: Math.max(l.a.x, l.b.x), y1: Math.max(l.a.y, l.b.y) }, i));
    grids.set(lines, g);
  }
  return g;
}

/** Calls `visit` for each line whose box meets `r`; a visit returning true stops. */
function nearLines(lines: OutsideScene['lines'], r: Rect, visit: (l: OutsideScene['lines'][number]) => boolean | void): void {
  gridOf(lines).query(growBox(r), (_, i) => visit(lines[i]) === true);
}
const growBox = (r: Rect): Rect => ({ x0: r.x0 - 1e-6, y0: r.y0 - 1e-6, x1: r.x1 + 1e-6, y1: r.y1 + 1e-6 });

const crosses = (r: Rect, lines: OutsideScene['lines']): boolean => {
  let hit = false;
  nearLines(lines, r, (l) => (hit = segmentHitsRect(r, l.a, l.b)));
  return hit;
};

/** Whether the leader a-b crosses a line anywhere but at the room's outline. */
export function leaderCrossesOutsideEntry(ring: readonly Pt[], a: Pt, b: Pt, lines: OutsideScene['lines']): boolean {
  let bad = false;
  nearLines(lines, { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) }, (l) => {
    const at = crossing(a, b, l.a, l.b);
    if (!at) return false;
    const near = nearestOnRing(ring, at);
    return (bad = Math.hypot(near.x - at.x, near.y - at.y) > ENTRY_BAND);
  });
  return bad;
}

/** The points inside the room's cut that no line touches: where a leader may end. */
function tipsOf(ring: readonly Pt[], lines: OutsideScene['lines']): Pt[] {
  const box = ringBounds(ring);
  const step = Math.max(0.1, Math.max(box.x1 - box.x0, box.y1 - box.y0) / 60);
  const out: Pt[] = [];
  for (let y = box.y0 + step / 2; y < box.y1; y += step) {
    for (let x = box.x0 + step / 2; x < box.x1; x += step) {
      const p = { x, y };
      if (pointInRing(ring, p) && !crosses(rectAround(p, 0.2, 0.2), lines)) out.push(p);
    }
  }
  return out;
}

export interface OutsidePlace {
  centre: Pt;
  /** Where the leader ends, inside the room's cut. */
  tip: Pt;
}

/**
 * The tag of size `w` by `h` for the room with cut outline `ring`, outside it: `gap` is the space kept round the tag.
 * `annotations` holds what is already drawn (and the tags placed before). Null when no such place exists.
 */
export function roomLabelOutside(ring: readonly Pt[], w: number, h: number, scene: OutsideScene, annotations: RectIndex, gap: number): OutsidePlace | null {
  const tips = tipsOf(ring, scene.lines);
  if (tips.length === 0) return null;
  const room = ringBounds(ring);
  const top: Pt = { x: (room.x0 + room.x1) / 2, y: room.y1 };
  const step = Math.max(0.2, h / 3);
  const free = (c: Pt): boolean => {
    const r = rectAround(c, w + gap, h + gap);
    return !crosses(r, scene.lines) && !annotations.any(r);
  };
  const place = (c: Pt): OutsidePlace | null => {
    if (!free(c)) return null;
    // The nearest end the leader can reach without crossing a line but at the room's outline.
    const near = [...tips].sort((p, q) => Math.hypot(p.x - c.x, p.y - c.y) - Math.hypot(q.x - c.x, q.y - c.y) || p.x - q.x || p.y - q.y).slice(0, 40);
    const tip = near.find((p) => !leaderCrossesOutsideEntry(ring, c, p, scene.lines));
    return tip ? { centre: c, tip } : null;
  };
  const b = scene.bounds;
  const above: Pt[] = [];
  for (let y = room.y1 + gap + h / 2; y <= b.y1 + gap + h / 2 + step; y += step) for (let x = b.x0 + w / 2; x <= b.x1 - w / 2; x += step) above.push({ x, y });
  const beside: Pt[] = [];
  const mid = (room.y0 + room.y1) / 2;
  for (const x of [b.x0 - gap - w / 2, b.x1 + gap + w / 2]) for (let y = mid - 3 * (room.y1 - room.y0); y <= mid + 3 * (room.y1 - room.y0); y += step) beside.push({ x, y });
  const byDistance = (list: Pt[]) => list.sort((p, q) => Math.hypot(p.x - top.x, p.y - top.y) - Math.hypot(q.x - top.x, q.y - top.y) || p.x - q.x || p.y - q.y);
  for (const c of [...byDistance(above), ...byDistance(beside)]) {
    const found = place(c);
    if (found) return found;
  }
  return null;
}
