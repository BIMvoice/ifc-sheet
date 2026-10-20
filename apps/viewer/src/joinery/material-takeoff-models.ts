/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The loaded models read into `material-takeoff.ts`'s input: every element
 * that has a material, its IFC class, its materials' shares and its Qto
 * quantities in SI. Material associations are parsed on demand, so this runs
 * when a takeoff is drawn, not per render (callers memoise on the models).
 */

import { extractAllMaterialsOnDemand, extractProjectUnits, ProjectUnits } from '@ifc-lite/parser';
import { createListDataProvider } from '@/lib/lists';
import { useViewerStore } from '@/store';
import { elementQuantities, materialShares, type TakeoffElement } from './material-takeoff';

/** SI scales of a model's area and volume units (undeclared: the length unit squared, cubed). */
function quantityScales(units: ProjectUnits): { volume: number; area: number } {
  const length = units.unitForMeasure('IfcLengthMeasure')?.siScale ?? 1;
  return {
    volume: units.resolvedForUnitType('VOLUMEUNIT')?.siScale ?? length ** 3,
    area: units.resolvedForUnitType('AREAUNIT')?.siScale ?? length ** 2,
  };
}

export function collectTakeoffElements(): TakeoffElement[] {
  const s = useViewerStore.getState();
  const out: TakeoffElement[] = [];
  for (const [modelId, model] of s.models) {
    const store = model.ifcDataStore;
    if (!store || model.visible === false) continue;
    const view = s.mutationViews.get(modelId) ?? undefined;
    const provider = createListDataProvider(store, model.name, undefined, view);
    const scales = quantityScales(store.source.length > 0 ? extractProjectUnits(store.source, store.entityIndex) : ProjectUnits.empty());
    for (const id of provider.getAllEntityIds?.() ?? []) {
      const materials = materialShares(extractAllMaterialsOnDemand(store, id));
      if (materials.length === 0) continue;
      out.push({ className: provider.getEntityTypeName(id), materials, ...elementQuantities(provider.getQuantitySets(id), scales) });
    }
  }
  return out;
}
