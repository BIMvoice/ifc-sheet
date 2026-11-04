/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * JOIN (#668), the plain part: order open pieces (a line, or an open polyline) end to end into chains. A piece joins a chain
 * when one of its two ends lies within `tol` of the chain's head or tail; a piece that arrives reversed is flipped. A chain
 * whose two ends meet is closed. Drawing units are metres, so `JOIN_TOLERANCE` is 1 mm.
 *
 * The arc and the circle are not here: the polyline of the drafts holds points only (`{ type: 'polyline'; pts; closed }`), so an
 * arc cannot be one of its segments and is left as it is.
 */

import type { Pt } from './types';

/** How far two ends may be apart and still count as touching (drawing units, metres: 1 mm). */
export const JOIN_TOLERANCE = 0.001;

export interface Piece {
  id: string;
  pts: readonly Pt[];
}

export interface Chain {
  /** The pieces in the chain, in order along it. */
  ids: string[];
  /** The piece the chain started from: the first of those given that it contains. */
  seed: string;
  pts: Pt[];
  closed: boolean;
}

const near = (a: Pt, b: Pt, tol: number): boolean => Math.hypot(a.x - b.x, a.y - b.y) <= tol;

/** `p` joined to `pts` where one of its ends meets the head or the tail of `pts`; null when neither end does. */
function attach(pts: Pt[], p: readonly Pt[], tol: number): { pts: Pt[]; atHead: boolean } | null {
  const head = pts[0];
  const tail = pts[pts.length - 1];
  const first = p[0];
  const last = p[p.length - 1];
  if (near(tail, first, tol)) return { pts: [...pts, ...p.slice(1)], atHead: false };
  if (near(tail, last, tol)) return { pts: [...pts, ...[...p].reverse().slice(1)], atHead: false };
  if (near(head, last, tol)) return { pts: [...p.slice(0, -1), ...pts], atHead: true };
  if (near(head, first, tol)) return { pts: [...[...p].reverse().slice(0, -1), ...pts], atHead: true };
  return null;
}

/**
 * `pieces` as chains, each started from the first piece still unused, so the order given decides which piece a chain starts from.
 * Every piece is in exactly one chain; a chain of one id is a piece that touched nothing.
 */
export function chainPieces(pieces: readonly Piece[], tol: number = JOIN_TOLERANCE): Chain[] {
  const left = pieces.filter((p) => p.pts.length >= 2);
  const chains: Chain[] = [];
  for (let seed = left.shift(); seed; seed = left.shift()) {
    const ids = [seed.id];
    let pts = [...seed.pts];
    for (let grew = true; grew;) {
      grew = false;
      for (let i = 0; i < left.length; i++) {
        const joined = attach(pts, left[i].pts, tol);
        if (!joined) continue;
        pts = joined.pts;
        if (joined.atHead) ids.unshift(left[i].id); else ids.push(left[i].id);
        left.splice(i, 1);
        grew = true;
        break;
      }
    }
    // Ends that meet close the chain (three corners at least, or it would be a line drawn over itself).
    const closed = ids.length > 1 && pts.length >= 4 && near(pts[0], pts[pts.length - 1], tol);
    chains.push({ ids, seed: seed.id, pts: closed ? pts.slice(0, -1) : pts, closed });
  }
  return chains;
}
