/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A witness point picked on a dimension chain (#494): a click on the point of
 * a chain of two or more dimensions selects the dimension and marks that point,
 * and Delete then removes the point (as DIMREMOVEPOINT does) instead of the
 * whole dimension. The mark belongs to the selection set the click made, so any
 * later selection change, whoever makes it, drops it.
 */

import { useProjectStore } from '@/project/project-store';
import { dimensionLayout } from './annotation';
import { chainOf, chainPoints, removeChainPoint } from './dimension-chain-edit';
import { commitDrafts } from './draft-store';
import type { DraftEntity, Pt } from './types';
import { COINCIDENT, add, dist, dot, scale, sub } from './vec';

let mark: { selection: ReadonlySet<string>; id: string; at: Pt } | null = null;

/** How far `p` is from the witness line of `q`: the segment from the measured point to the chain's dimension line. */
function witnessDistance(p: Pt, q: Pt, line: { a: Pt; b: Pt }): number {
  const len = dist(line.a, line.b);
  if (len < COINCIDENT) return Infinity;
  const dir = scale(sub(line.b, line.a), 1 / len);
  const foot = add(line.a, scale(dir, dot(sub(q, line.a), dir)));
  const seg = sub(foot, q), l2 = dot(seg, seg);
  const t = l2 < COINCIDENT ? 0 : Math.min(1, Math.max(0, dot(sub(p, q), seg) / l2));
  return dist(p, add(q, scale(seg, t)));
}

/** Remember the chain point of `hit` whose witness line the click at `p` landed on (within `tolerance`), if any, for `selection`. */
export function markWitnessPoint(selection: ReadonlySet<string>, hit: DraftEntity | null, p: Pt, tolerance: number): void {
  mark = null;
  if (!hit || hit.shape.type !== 'dimension' || selection.size !== 1 || !selection.has(hit.id)) return;
  const chain = chainOf(useProjectStore.getState().drafts, hit.id);
  if (chain.length < 2) return;
  const line = dimensionLayout(chain[0].shape).lines[2];
  let best: Pt | null = null, bestD = tolerance;
  for (const q of chainPoints(chain)) { const d = witnessDistance(p, q, line); if (d <= bestD) { best = q; bestD = d; } }
  if (best) mark = { selection, id: hit.id, at: best };
}

/** Remove the marked witness point from its chain when `selection` is still the one it was picked in; whether it did. */
export function removeMarkedWitnessPoint(selection: ReadonlySet<string>): boolean {
  const m = mark;
  mark = null;
  if (!m || m.selection !== selection) return false;
  const next = removeChainPoint(useProjectStore.getState().drafts, m.id, m.at, 1e-6);
  if (!next) return false;
  commitDrafts(next);
  return true;
}
