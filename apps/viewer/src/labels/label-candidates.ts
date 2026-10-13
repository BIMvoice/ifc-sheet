/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where a label may go beside its element, in the order to try them: for a
 * long thin element (a wall, a beam) centred along it on each side, then
 * slid along it, then past its ends; for a compact one (a door, a column)
 * on each side of it. Then the same again further out. All distances are
 * given by the caller (paper millimetres at the view's scale, in drawing
 * units), so the order and the result are the same at 1:50 and 1:200.
 */

import type { Pt } from '@/drafting/types';
import { ringBounds } from './label-geometry';

/** The smallest rectangle round a ring, turned to the ring's own direction: `u` along the long side. */
export interface OrientedBox {
  c: Pt;
  u: Pt;
  v: Pt;
  hu: number;
  hv: number;
}

/** The oriented box of least area over the directions of the ring's edges. */
export function orientedBox(ring: readonly Pt[]): OrientedBox {
  let best: OrientedBox | null = null, bestArea = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l < 1e-9) continue;
    const u = { x: (b.x - a.x) / l, y: (b.y - a.y) / l }, v = { x: -u.y, y: u.x };
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of ring) {
      const pu = p.x * u.x + p.y * u.y, pv = p.x * v.x + p.y * v.y;
      u0 = Math.min(u0, pu); u1 = Math.max(u1, pu); v0 = Math.min(v0, pv); v1 = Math.max(v1, pv);
    }
    const area = (u1 - u0) * (v1 - v0);
    if (area < bestArea - 1e-12) {
      bestArea = area;
      const mu = (u0 + u1) / 2, mv = (v0 + v1) / 2;
      best = { c: { x: u.x * mu + v.x * mv, y: u.y * mu + v.y * mv }, u, v, hu: (u1 - u0) / 2, hv: (v1 - v0) / 2 };
    }
  }
  if (!best) {
    const b = ringBounds(ring);
    return { c: { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }, u: { x: 1, y: 0 }, v: { x: 0, y: 1 }, hu: (b.x1 - b.x0) / 2, hv: (b.y1 - b.y0) / 2 };
  }
  // The long side is `u`.
  return best.hv > best.hu ? { c: best.c, u: best.v, v: { x: -best.v.y, y: best.v.x }, hu: best.hv, hv: best.hu } : best;
}

/** An element is long and thin from this ratio of its length to its width. */
export const LONG_RATIO = 3;

export interface CandidateInput {
  box: OrientedBox;
  /** The label's outer size. */
  w: number;
  h: number;
  /** Clear space between element and label. */
  gap: number;
  /** A direction pointing away from the building (outside first); (0,0) when not known. */
  away: Pt;
}

/** How far a rectangle w by h reaches along the unit direction n from its centre. */
const reach = (n: Pt, w: number, h: number): number => (Math.abs(n.x) * w) / 2 + (Math.abs(n.y) * h) / 2;

const DIAG = Math.SQRT1_2;
/** The eight ways round a compact element, in the order tried when nothing says otherwise: right, left, above, below, then the corners. */
const COMPASS: readonly Pt[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }, { x: DIAG, y: DIAG }, { x: -DIAG, y: DIAG }, { x: DIAG, y: -DIAG }, { x: -DIAG, y: -DIAG }];
/** Distances of the further rings, as multiples of the gap. */
const RINGS = [1, 2.5, 4, 6, 9, 13] as const;

/** The centres to try, best first. Deterministic: the same input gives the same list. */
export function candidateCentres(input: CandidateInput): Pt[] {
  const { box, w, h, gap, away } = input;
  const out: Pt[] = [];
  const along = (n: Pt, g: number, shiftU: number, shiftV: number): Pt => {
    const r = Math.abs(n.x * box.u.x + n.y * box.u.y) * box.hu + Math.abs(n.x * box.v.x + n.y * box.v.y) * box.hv + g + reach(n, w, h);
    return { x: box.c.x + n.x * r + box.u.x * shiftU + box.v.x * shiftV, y: box.c.y + n.y * r + box.u.y * shiftU + box.v.y * shiftV };
  };
  const long = box.hu >= LONG_RATIO * box.hv;
  if (long) {
    // The side facing away from the building first; with nothing to go by, the one facing +x then +y.
    const faces = away.x * box.v.x + away.y * box.v.y;
    const sign = Math.abs(faces) > 1e-9 ? Math.sign(faces) : box.v.x > 1e-9 || (Math.abs(box.v.x) <= 1e-9 && box.v.y > 0) ? 1 : -1;
    const sides: Pt[] = [{ x: box.v.x * sign, y: box.v.y * sign }, { x: -box.v.x * sign, y: -box.v.y * sign }];
    const ends: Pt[] = [box.u, { x: -box.u.x, y: -box.u.y }];
    for (const k of RINGS) {
      const g = gap * k;
      for (const s of [0, 0.3, -0.3]) for (const n of sides) out.push(along(n, g, s * 2 * box.hu, 0));
      if (k === 1 || k === 2.5) for (const n of ends) out.push(along(n, g, 0, 0));
    }
    return out;
  }
  // The four sides first (the one facing away from the building leading), then the corners the same way.
  const facing = (list: readonly Pt[]): Pt[] => (away.x === 0 && away.y === 0 ? [...list] : [...list].sort((a, b) => (b.x * away.x + b.y * away.y) - (a.x * away.x + a.y * away.y)));
  const order = [...facing(COMPASS.slice(0, 4)), ...facing(COMPASS.slice(4))];
  for (const k of RINGS) for (const n of order) out.push(along(n, gap * k, 0, 0));
  return out;
}
