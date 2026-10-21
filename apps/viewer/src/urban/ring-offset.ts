/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A ring moved sideways by a small distance, to close the hairline gaps
 * between touching elements before a union (`footprint.ts`): two walls
 * meeting on a mitre are, in f32 mesh coordinates, a few 1e-7 m apart, and a
 * union of them leaks a room into the outside through that gap.
 *
 * Every edge moves `d` to its RIGHT. A counter-clockwise ring therefore
 * grows and a clockwise one (a hole) shrinks, which is what "grow the
 * material" means for both. Corners are mitred; a corner sharper than the
 * miter limit is bevelled, so a spike never shoots out.
 */

import type { Pt } from './indicators';

/** A mitre longer than this many `d` is bevelled. */
const MITER_LIMIT = 2;
const EPS = 1e-12;

/** The ring without repeated consecutive points. */
function distinct(ring: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of ring) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > EPS) out.push(p);
  }
  while (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= EPS) out.pop();
  return out;
}

/** The unit normal to the right of the edge a → b. */
function rightNormal(a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  return [dy / len, -dx / len];
}

export function offsetRing(ring: readonly Pt[], d: number): Pt[] {
  const pts = distinct(ring);
  const n = pts.length;
  if (n < 3) return pts;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i + n - 1) % n], cur = pts[i], next = pts[(i + 1) % n];
    const n1 = rightNormal(prev, cur), n2 = rightNormal(cur, next);
    const cos = n1[0] * n2[0] + n1[1] * n2[1];
    const k = 1 + cos;
    // |mitre| = d * sqrt(2 / (1 + cos)); bevel past the limit.
    if (k > EPS && 2 / k <= MITER_LIMIT * MITER_LIMIT) {
      out.push([cur[0] + (d * (n1[0] + n2[0])) / k, cur[1] + (d * (n1[1] + n2[1])) / k]);
    } else {
      out.push([cur[0] + d * n1[0], cur[1] + d * n1[1]], [cur[0] + d * n2[0], cur[1] + d * n2[1]]);
    }
  }
  return out;
}
