/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** What a drafting command sees as already drawn in a view, and which of it a point picks. */

import { useProjectStore } from '@/project/project-store';
import { insideArea, nearestOnEdges } from './annotation';
import { draftsOfView } from './draft-store';
import type { DraftEntity, Pt } from './types';

/** The view's drafted entities on visible, unlocked layers: what a command sees as already there. */
export function visibleEntities(viewId: string): DraftEntity[] {
  const { drafts, draftLayers } = useProjectStore.getState();
  const usable = new Set(draftLayers.filter((l) => l.visible && !l.locked).map((l) => l.id));
  return draftsOfView(viewId, drafts).filter((d) => usable.has(d.layerId));
}

/**
 * The entity nearest to `p` within `tolerance` drawing units. A line (or a hatch's edge) within the
 * tolerance beats the interior of a filled area, however the two were drawn (#670); only when no
 * edge is in reach does the area the point lies in count as picked.
 */
export function nearestEntity(entities: readonly DraftEntity[], p: Pt, tolerance: number): DraftEntity | null {
  let best: DraftEntity | null = null;
  let bestDist = tolerance;
  for (const entity of entities) {
    const d = nearestOnEdges(entity.shape, p).dist;
    if (d <= bestDist) {
      best = entity;
      bestDist = d;
    }
  }
  if (best) return best;
  for (const entity of entities) if (insideArea(entity.shape, p)) best = entity;
  return best;
}
