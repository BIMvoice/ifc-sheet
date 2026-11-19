/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Freehand strokes (#833): a pointer path simplified to the fewest points that stay within a tolerance of it. */

import type { Pt } from './types';

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Ramer-Douglas-Peucker, iterative (a stroke can be thousands of points): keeps both ends, drops each point within `tolerance` of the line its neighbours leave. */
export function simplifyStroke(pts: readonly Pt[], tolerance: number): Pt[] {
  if (pts.length <= 2) return [...pts];
  const keep = new Array<boolean>(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const spans: [number, number][] = [[0, pts.length - 1]];
  while (spans.length) {
    const [i, j] = spans.pop()!;
    let far = -1, farDist = tolerance;
    for (let k = i + 1; k < j; k++) {
      const d = distToSegment(pts[k], pts[i], pts[j]);
      if (d > farDist) { far = k; farDist = d; }
    }
    if (far < 0) continue;
    keep[far] = true;
    spans.push([i, far], [far, j]);
  }
  return pts.filter((_, k) => keep[k]);
}
