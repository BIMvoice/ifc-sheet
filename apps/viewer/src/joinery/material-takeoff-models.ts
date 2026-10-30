/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The loaded models read into `material-takeoff.ts`'s input: every element
 * that has a material, its IFC class, its materials' shares and its Qto
 * quantities in SI, a figure the model does not state measured from the
 * element's meshes (#74). Material associations are parsed on demand, so this
 * runs when a takeoff is drawn, not per render (callers memoise on the models).
 */

import { extractAllMaterialsOnDemand, extractProjectUnits, ProjectUnits } from '@ifc-lite/parser';
import { withMeasured } from '@bimvoice/ifcsheet';
import type { ScheduleModel } from '@bimvoice/ifcsheet/project';
import { elementQuantities, materialShares, type TakeoffElement } from './material-takeoff';
import { loadedScheduleModels, providerOf } from './schedule-models';

/** SI scales of a model's area and volume units (undeclared: the length unit squared, cubed). */
export function quantityScales(units: ProjectUnits): { length: number; volume: number; area: number } {
  const length = units.unitForMeasure('IfcLengthMeasure')?.siScale ?? 1;
  return {
    length,
    volume: units.resolvedForUnitType('VOLUMEUNIT')?.siScale ?? length ** 3,
    area: units.resolvedForUnitType('AREAUNIT')?.siScale ?? length ** 2,
  };
}

/** The takeoff's elements over `models` (default: the loaded, visible ones). */
export function collectTakeoffElements(models: readonly ScheduleModel[] = loadedScheduleModels()): TakeoffElement[] {
  const out: TakeoffElement[] = [];
  for (const model of models) {
    const store = model.dataStore, provider = providerOf(model);
    const scales = quantityScales(store.source.length > 0 ? extractProjectUnits(store.source, store.entityIndex) : ProjectUnits.empty());
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
