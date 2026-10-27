/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `ruralScopeOf` for a model opened by the command line (`openModel`): its storeys merged into levels the way the app's level
 * list is (`levelsFromStoreys`), what stands on each outlined by the same measure the app runs (`measureStoreys`), and the
 * indicators read with the project's urban settings. No edits to the model, and no GPU-instanced elements, are in a model opened
 * from bytes, so the meshes are all there is to read.
 */

import { extractAllEntityAttributes, type IfcDataStore } from '@ifc-lite/parser';
import { iterateEffectiveEntityIds } from '@ifc-lite/mutations';
import type { MeshData } from '@ifc-lite/geometry';
import type { RuralScope } from './readiness.js';
import { ruralScopeOf } from './rural-scope.js';
import { levelsFromStoreys, type StoreyInput } from './view-defaults.js';
import { buildingRefElevationOf, measureStoreys, meshesById, URBAN_FOOTPRINT_CLASSES } from './urban-measure.js';
import { urbanIndicators, type UrbanSettings } from './urban-indicators.js';

/** What `ruralScopeOfModel` reads of an opened model. */
export interface RuralScopeModel {
  dataStore: IfcDataStore;
  storeys: readonly StoreyInput[];
  meshes?: readonly MeshData[];
}

export function ruralScopeOfModel(model: RuralScopeModel, settings?: UrbanSettings): RuralScope {
  const store = model.dataStore;
  const levels = levelsFromStoreys(model.storeys);
  const levelOfStorey = new Map<number, number>();
  for (const storeyId of store.spatialHierarchy?.byStorey.keys() ?? []) {
    const gid = store.entities.getGlobalId(storeyId);
    const index = levels.findIndex((l) => l.storeyGlobalIds.includes(gid));
    if (index >= 0) levelOfStorey.set(storeyId, index);
  }
  const meshes = meshesById(model.meshes ?? []);
  const { storeys } = measureStoreys(levels, [{
    ids: iterateEffectiveEntityIds(store, null, [...URBAN_FOOTPRINT_CLASSES]),
    levelOf: (id) => {
      const storey = store.spatialHierarchy?.elementToStorey.get(id);
      return storey === undefined ? null : levelOfStorey.get(storey) ?? null;
    },
    isRoofSlab: (id) => store.source.length > 0 && extractAllEntityAttributes(store, id).find((a) => a.name === 'PredefinedType')?.value?.toString().replace(/\./g, '').toUpperCase() === 'ROOF',
    meshesOf: (id) => meshes.get(id),
  }]);
  return ruralScopeOf(urbanIndicators({ storeys, spaces: [], siteArea: null, buildingRefElevation: buildingRefElevationOf(store), ...(settings ? { settings } : {}) }));
}
