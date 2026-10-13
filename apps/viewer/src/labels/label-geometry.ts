/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The plane geometry label placement needs: rectangles (a label's box, an
 * annotation's bounds), element outlines as rings, and whether and how far
 * the two are apart. Pure, in drawing units.
 */

import type { Pt } from '@/drafting/types';

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const rectAround = (c: Pt, w: number, h: number): Rect => ({ x0: c.x - w / 2, y0: c.y - h / 2, x1: c.x + w / 2, y1: c.y + h / 2 });
export const rectCentre = (r: Rect): Pt => ({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });
export const growRect = (r: Rect, m: number): Rect => ({ x0: r.x0 - m, y0: r.y0 - m, x1: r.x1 + m, y1: r.y1 + m });

export function ringBounds(ring: readonly Pt[]): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of ring) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
}

export const rectsOverlap = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

const inside = (r: Rect, p: Pt): boolean => p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1;

function orient(a: Pt, b: Pt, c: Pt): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

function cornersOf(r: Rect): Pt[] {
  return [{ x: r.x0, y: r.y0 }, { x: r.x1, y: r.y0 }, { x: r.x1, y: r.y1 }, { x: r.x0, y: r.y1 }];
}

export function pointInRing(ring: readonly Pt[], p: Pt): boolean {
  let in_ = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if ((ring[i].y > p.y) !== (ring[j].y > p.y) && p.x < ((ring[j].x - ring[i].x) * (p.y - ring[i].y)) / (ring[j].y - ring[i].y) + ring[i].x) in_ = !in_;
  }
  return in_;
}

/** Whether the rectangle and the area inside the ring share any area: an edge crosses, one holds a corner of the other, or one holds the other. */
export function rectHitsRing(r: Rect, ring: readonly Pt[]): boolean {
  if (ring.length < 3) return false;
  if (!rectsOverlap(r, ringBounds(ring))) return false;
  if (ring.some((p) => inside(r, p))) return true;
  const corners = cornersOf(r);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    for (let k = 0; k < 4; k++) if (segmentsCross(a, b, corners[k], corners[(k + 1) % 4])) return true;
  }
  return pointInRing(ring, rectCentre(r)) || corners.some((c) => pointInRing(ring, c));
}

/** Whether the rectangle lies wholly inside the area of the ring: its corners do, no outline corner pokes into it, no edge crosses it. */
export function rectInsideRing(r: Rect, ring: readonly Pt[]): boolean {
  if (ring.length < 3) return false;
  const corners = cornersOf(r);
  if (!corners.every((c) => pointInRing(ring, c)) || ring.some((p) => inside(r, p))) return false;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    for (let k = 0; k < 4; k++) if (segmentsCross(a, b, corners[k], corners[(k + 1) % 4])) return false;
  }
  return true;
}

/** The point of the rectangle nearest `p` (`p` itself when inside). */
export function clampToRect(r: Rect, p: Pt): Pt {
  return { x: Math.min(Math.max(p.x, r.x0), r.x1), y: Math.min(Math.max(p.y, r.y0), r.y1) };
}

function nearestOnSegment(a: Pt, b: Pt, p: Pt): Pt {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** The point on the ring's outline nearest `p`. */
export function nearestOnRing(ring: readonly Pt[], p: Pt): Pt {
  let best = ring[0], bestD = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const q = nearestOnSegment(ring[i], ring[(i + 1) % ring.length], p);
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bestD) { bestD = d; best = q; }
  }
  return best;
}

/** How far the rectangle is from the ring's area; 0 when they touch or overlap. */
export function rectRingGap(r: Rect, ring: readonly Pt[]): number {
  if (ring.length < 3 || rectHitsRing(r, ring)) return 0;
  let best = Infinity;
  const corners = cornersOf(r);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    for (const p of [a, b]) best = Math.min(best, Math.hypot(p.x - clampToRect(r, p).x, p.y - clampToRect(r, p).y));
    for (const c of corners) {
      const q = nearestOnSegment(a, b, c);
      best = Math.min(best, Math.hypot(q.x - c.x, q.y - c.y));
    }
  }
  return best;
}

/** The convex hull, counter-clockwise (a ring too detailed to test cheaply is stood in for by it). */
export function convexHull(pts: readonly Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const half = (list: Pt[]): Pt[] => {
    const h: Pt[] = [];
    for (const q of list) {
      while (h.length >= 2 && orient(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop();
      h.push(q);
    }
    h.pop();
    return h;
  };
  return [...half(p), ...half([...p].reverse())];
}
