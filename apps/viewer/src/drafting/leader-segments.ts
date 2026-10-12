/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The second segment of a two-segment leader: free at any angle, but easy to
 * make orthogonal. Drawn within `SNAP_DEG` of horizontal or vertical it squares
 * itself; the guides show those two directions through the bend.
 */

import type { Pt } from './types';
import { COINCIDENT, dist } from './vec';

/** How close to horizontal / vertical (degrees) the second segment squares itself. */
const SNAP_DEG = 15;

/** `p` squared to the horizontal or vertical through `elbow` when within `SNAP_DEG` of it, else `p`. */
export function snapLeaderEnd(elbow: Pt, p: Pt): Pt {
  if (dist(elbow, p) < COINCIDENT) return p;
  const dx = Math.abs(p.x - elbow.x);
  const dy = Math.abs(p.y - elbow.y);
  const tan = Math.tan((SNAP_DEG * Math.PI) / 180);
  if (dy <= dx * tan) return { x: p.x, y: elbow.y };
  if (dx <= dy * tan) return { x: elbow.x, y: p.y };
  return p;
}

/** The horizontal and vertical guide lines through the bend, reaching past the cursor (and at least `min`). */
export function orthoGuides(elbow: Pt, cursor: Pt, min: number): { a: Pt; b: Pt }[] {
  const r = Math.max(dist(elbow, cursor) * 1.25, min);
  return [
    { a: { x: elbow.x - r, y: elbow.y }, b: { x: elbow.x + r, y: elbow.y } },
    { a: { x: elbow.x, y: elbow.y - r }, b: { x: elbow.x, y: elbow.y + r } },
  ];
}

/**
 * Whether a leader's text reads to the right of its end on screen: it sits
 * beyond the end of the last segment, so a segment running leftward puts it
 * on the left and the line never runs through the words. `screenRight` is
 * +1 when drawing x grows rightward on screen, -1 when the view is mirrored.
 */
export function leaderTextRight(pts: readonly Pt[], screenRight: 1 | -1 = 1): boolean {
  if (pts.length < 2) return true;
  const dx = (pts[pts.length - 1].x - pts[pts.length - 2].x) * screenRight;
  return dx >= -COINCIDENT;
}
