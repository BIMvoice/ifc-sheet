/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The box the Wall lays its starting set out on, the building as `ifcsheet build` frames it (#618).
 *
 * The geometry can be in before the model's data store is: a small model's meshes arrive while its spatial
 * structure is still being read. Then the building cannot be told from its surroundings, and the only box left
 * is the box of everything (the site, the ground, the sky box around it), on which the set would be laid out at
 * another paper and scale than the engine's (FZK-Haus on A2, IfcOpenHouse at 1:100). So there is no extent
 * until every visible model that is still loading has its data store, and the Wall starts once it has. A model that finished loading without one (nothing to read) is measured as it is. The engine reads the data
 * store before it measures the geometry, so it never meets the gap.
 */

import type { MeshData } from '@ifc-lite/geometry';
import { mergedSectionBounds, type AxisBounds } from '@/lib/section/section-distance';
import { setExtent } from '@/draft-set/body';
import type { ProjectLevel } from './types';
import type { useViewerStore } from '@/store';

type ViewerState = ReturnType<typeof useViewerStore.getState>;

export interface WallSnapshot {
  levels: readonly ProjectLevel[];
  meshes: MeshData[] | null;
  models: ViewerState['models'];
  legacy: ViewerState['geometryResult'];
}

/** The extent of the set to start, or `null` while a visible model's data store is not in yet. */
export function wallExtent({ levels, meshes, models, legacy }: WallSnapshot): AxisBounds | null {
  for (const model of models.values()) {
    if (model.visible !== false && !model.ifcDataStore && model.loadState && model.loadState !== 'complete' && model.loadState !== 'error') return null;
  }
  return setExtent(levels, meshes, mergedSectionBounds(models, legacy)).extent;
}
