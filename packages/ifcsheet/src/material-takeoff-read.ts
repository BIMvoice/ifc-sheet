/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The models read into `material-takeoff.ts`'s input (#581): every element that has a material, its IFC class, its materials'
 * shares and its Qto quantities in SI, a figure the model does not state measured from the element's meshes (#74). Material
 * associations are parsed on demand, so this runs when a takeoff is drawn. It reads only `ScheduleModel`, so the app (its loaded
 * models, with their edit overlay and the live renderer's instanced pieces) and `ifcsheet build --project` (the opened model)
 * take the same elements from it.
 */

import { extractAllMaterialsOnDemand } from '@ifc-lite/parser';
import { boqScales } from './boq-read.js';
import type { ScheduleModel } from './joinery-schedule.js';
import { createHeadlessListProvider } from './list-provider.js';
import { elementQuantities, materialShares, type TakeoffElement } from './material-takeoff.js';
import { withMeasured } from './measured-quantities.js';

/** The takeoff's elements over `models`. */
export function takeoffElementsOf(models: readonly ScheduleModel[]): TakeoffElement[] {
  const out: TakeoffElement[] = [];
  for (const model of models) {
    const store = model.dataStore;
    const provider = model.listProvider?.() ?? createHeadlessListProvider(store, model.name ?? '');
    const scales = boqScales(store);
    for (const id of provider.getAllEntityIds?.() ?? []) {
      const materials = materialShares(extractAllMaterialsOnDemand(store, id));
      if (materials.length === 0) continue;
      const className = provider.getEntityTypeName(id);
      const q = withMeasured(elementQuantities(provider.getQuantitySets(id), scales), className, () => model.meshesOf?.(id));
      out.push({ className, materials, volume: q.volume, area: q.area, volumeSource: q.volumeSource, areaSource: q.areaSource, ...(q.volumeRefusal ? { volumeRefusal: q.volumeRefusal } : {}) });
    }
  }
  return out;
}
