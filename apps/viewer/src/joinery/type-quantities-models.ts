/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The loaded models read into `type-quantities.ts`'s input: every
 * geometry-bearing element with its defining type, its storey and its Qto
 * quantities in SI. It reads the quantities the way the material takeoff does
 * (the list provider's `getQuantitySets`, the model's units scaled to SI).
 */

import { RelationshipType } from '@ifc-lite/data';
import { extractProjectUnits, ProjectUnits } from '@ifc-lite/parser';
import { createListDataProvider } from '@/lib/lists';
import { useViewerStore } from '@/store';
import { quantityScales } from './material-takeoff-models';
import { elementTypeQuantities, type TypeElement } from './type-quantities';

export function collectTypeElements(): TypeElement[] {
  const s = useViewerStore.getState();
  const out: TypeElement[] = [];
  for (const [modelId, model] of s.models) {
    const store = model.ifcDataStore;
    if (!store || model.visible === false) continue;
    const view = s.mutationViews.get(modelId) ?? undefined;
    const provider = createListDataProvider(store, model.name, undefined, view);
    const scales = quantityScales(store.source.length > 0 ? extractProjectUnits(store.source, store.entityIndex) : ProjectUnits.empty());
    const hierarchy = store.spatialHierarchy;
    for (const id of provider.getAllEntityIds?.() ?? []) {
      const className = provider.getEntityTypeName(id);
      const typeId = store.relationships?.getRelated(id, RelationshipType.DefinesByType, 'inverse')[0];
      const typeName = typeId === undefined ? '' : provider.getEntityDefiningTypeName?.(id) ?? '';
      const storey = hierarchy?.elementToStorey.get(id);
      out.push({
        className,
        typeClass: typeId === undefined || !typeName ? null : provider.getEntityTypeName(typeId),
        typeName: typeName || null,
        level: provider.getStoreyName?.(id) ?? '',
        elevation: storey === undefined ? null : hierarchy?.storeyElevations.get(storey) ?? null,
        ...elementTypeQuantities(className, provider.getQuantitySets(id), scales),
      });
    }
  }
  return out;
}
