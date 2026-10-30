/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** What a drafting command sees as already drawn in a view, and which of it a point picks. */

import { useProjectStore } from '@/project/project-store';
import { nearestOnEntity } from './annotation';
import { draftsOfView } from './draft-store';
import type { DraftEntity, Pt } from './types';

/** The view's drafted entities on visible, unlocked layers: what a command sees as already there. */
export function visibleEntities(viewId: string): DraftEntity[] {
  const { drafts, draftLayers } = useProjectStore.getState();
  const usable = new Set(draftLayers.filter((l) => l.visible && !l.locked).map((l) => l.id));
  return draftsOfView(viewId, drafts).filter((d) => usable.has(d.layerId));
}

/** The entity nearest to `p` within `tolerance` drawing units. */
export function nearestEntity(entities: readonly DraftEntity[], p: Pt, tolerance: number): DraftEntity | null {
  let best: DraftEntity | null = null;
  let bestDist = tolerance;
  for (const entity of entities) {
    const d = nearestOnEntity(entity.shape, p).dist;
    if (d <= bestDist) {
      best = entity;
      bestDist = d;
    }
  }
  return best;
}
