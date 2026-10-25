/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The loaded models read into the elements of the bill of quantities (#75). The reading is the engine's (`readBoqElements`, the one loop the
 * command line uses): this only replaces the reads the session's edit overlay changes, with the list provider the other schedules read through
 * (`createListDataProvider`), so an element edited in the session is read as edited. Materials, types, storeys and units are the engine's own
 * code for both.
 */

import { predefinedTypeText } from '@bimvoice/ifcsheet';
import { readBoqElements, storeSource, type BoqSource } from '@bimvoice/ifcsheet/project';
import type { BoqElement } from '@bimvoice/ifcsheet';
import { createListDataProvider } from '@/lib/lists';
import { useViewerStore } from '@/store';

/** Every visible model's elements; `propertyNames` (lower case) are the properties the articles' filters read. */
export function collectBoqElements(propertyNames: ReadonlySet<string>): BoqElement[] {
  const s = useViewerStore.getState();
  const out: BoqElement[] = [];
  for (const [modelId, model] of s.models) {
    const store = model.ifcDataStore;
    if (!store || model.visible === false) continue;
    const provider = createListDataProvider(store, model.name, undefined, s.mutationViews.get(modelId) ?? undefined);
    const base = storeSource(modelId, store);
    const source: BoqSource = {
      ...base,
      ids: () => (provider.getAllEntityIds?.() ?? []),
      className: (id) => provider.getEntityTypeName(id),
      predefinedType: (id) => predefinedTypeText(provider.getEntityPredefinedType?.(id) ?? ''),
      globalId: (id) => provider.getEntityGlobalId?.(id) ?? '',
      name: (id) => provider.getEntityName(id),
      typeName: (id) => provider.getEntityDefiningTypeName?.(id) ?? '',
      propertySets: (id) => provider.getPropertySets(id),
      quantitySets: (id) => provider.getQuantitySets(id),
    };
    out.push(...readBoqElements(source, propertyNames));
  }
  return out;
}
