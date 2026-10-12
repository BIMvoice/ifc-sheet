/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A loaded model element as a label reads it: through the same data provider
 * the lists use, so a property edited in the Properties panel, an element
 * renamed, a type's own properties and a session-created element all read as
 * they will export. Elements are found by GlobalId, so a label keeps pointing
 * at its element whatever the session's ids.
 */

import type { IfcDataStore } from '@ifc-lite/parser';
import type { ListDataProvider } from '@ifc-lite/lists';
import { createListDataProvider } from '@/lib/lists/adapter';
import { elementByGlobalId } from '@/project/element-label';
import { useViewerStore } from '@/store';
import type { LabelElement } from './label-resolve';

interface Cached {
  version: number;
  view: unknown;
  provider: ListDataProvider;
}
const providers = new WeakMap<IfcDataStore, Cached>();

function providerOf(modelId: string): ListDataProvider | null {
  const s = useViewerStore.getState();
  const store = s.models.get(modelId)?.ifcDataStore;
  if (!store) return null;
  const view = s.mutationViews.get(modelId);
  const cached = providers.get(store);
  if (cached && cached.version === s.mutationVersion && cached.view === view) return cached.provider;
  const provider = createListDataProvider(store, s.models.get(modelId)?.name ?? '', undefined, view ?? undefined);
  providers.set(store, { version: s.mutationVersion, view, provider });
  return provider;
}

export function labelElementOf(modelId: string, expressId: number): LabelElement | null {
  const p = providerOf(modelId);
  if (!p) return null;
  return {
    attribute: (name) => {
      switch (name) {
        case 'Name': return p.getEntityName(expressId);
        case 'Tag': return p.getEntityTag(expressId);
        case 'ObjectType': return p.getEntityObjectType(expressId);
        case 'Description': return p.getEntityDescription(expressId);
        case 'PredefinedType': return p.getEntityPredefinedType?.(expressId) ?? '';
        case 'GlobalId': return p.getEntityGlobalId(expressId);
      }
    },
    className: () => p.getEntityTypeName(expressId),
    typeName: () => p.getEntityDefiningTypeName?.(expressId) ?? '',
    propertySets: () => p.getPropertySets(expressId),
    quantitySets: () => p.getQuantitySets(expressId),
    typePropertySets: () => p.getTypePropertySets?.(expressId) ?? [],
    typeQuantitySets: () => p.getTypeQuantitySets?.(expressId) ?? [],
    materials: () => p.getMaterialNames?.(expressId) ?? [],
    storey: () => p.getStoreyName?.(expressId) ?? '',
  };
}

/** The element a GlobalId names, as a label reads it; null when no loaded model has it. */
export function labelElementByGlobalId(globalId: string): LabelElement | null {
  const at = elementByGlobalId(globalId);
  return at ? labelElementOf(at.modelId, at.expressId) : null;
}
