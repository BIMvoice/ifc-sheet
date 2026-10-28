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

import { extractAllEntityAttributes, type IfcDataStore } from '@ifc-lite/parser';
import type { ListDataProvider } from '@ifc-lite/lists';
import { tagClassification } from '@/classification/classification-model';
import { createListDataProvider } from '@/lib/lists/adapter';
import { elementByGlobalId } from '@/project/element-label';
import { useProjectStore } from '@/project/project-store';
import { useViewerStore } from '@/store';
import { QuantityType, type QuantitySet } from '@ifc-lite/data';
import type { LabelElement, QuantitySetLike } from './label-resolve';

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

const withLengths = (set: QuantitySet): QuantitySetLike => ({
  name: set.name,
  quantities: set.quantities.map((q) => ({ name: q.name, value: q.value, length: q.type === QuantityType.Length })),
});

/** An element's own LongName (rooms carry their name there), read from the source record; '' without one. */
function longNameOf(modelId: string, expressId: number): string {
  const store = useViewerStore.getState().models.get(modelId)?.ifcDataStore;
  if (!store?.source?.length || !store.entityIndex) return '';
  const known = longNames.get(store) ?? new Map<number, string>();
  longNames.set(store, known);
  const cached = known.get(expressId);
  if (cached !== undefined) return cached;
  const value = extractAllEntityAttributes(store, expressId).find((a) => a.name === 'LongName')?.value;
  const name = typeof value === 'string' ? value : '';
  known.set(expressId, name);
  return name;
}
const longNames = new WeakMap<IfcDataStore, Map<number, string>>();

/**
 * A Tag a draughtsman would write on a drawing: tools that fill Tag with the element's unique id (a GUID, or an
 * identifier of hex groups joined by hyphens) leave nothing to show, and the element is then marked by its Name.
 */
export function markOf(tag: string): string {
  const t = tag.trim();
  return /^[0-9A-Fa-f]{6,}(?:-[0-9A-Fa-f]{2,}){3,}$/.test(t) || /^[0-9A-Za-z_$]{22}$/.test(t) && /\d/.test(t) && /[a-z]/.test(t) && /[A-Z]/.test(t) ? '' : t;
}

export function labelElementOf(modelId: string, expressId: number): LabelElement | null {
  const p = providerOf(modelId);
  if (!p) return null;
  const lengthScale = useViewerStore.getState().models.get(modelId)?.ifcDataStore?.lengthUnitScale ?? 1;
  return {
    attribute: (name) => {
      switch (name) {
        case 'Name': return p.getEntityName(expressId);
        case 'Tag': return p.getEntityTag(expressId);
        case 'LongName': return longNameOf(modelId, expressId);
        case 'RoomNumber': return longNameOf(modelId, expressId) ? p.getEntityName(expressId) : '';
        case 'Mark': return markOf(p.getEntityTag(expressId));
        case 'TagName': return '';
        case 'ObjectType': return p.getEntityObjectType(expressId);
        case 'Description': return p.getEntityDescription(expressId);
        case 'PredefinedType': return p.getEntityPredefinedType?.(expressId) ?? '';
        case 'GlobalId': return p.getEntityGlobalId(expressId);
      }
    },
    className: () => p.getEntityTypeName(expressId),
    typeName: () => p.getEntityDefiningTypeName?.(expressId) ?? '',
    propertySets: () => p.getPropertySets(expressId),
    quantitySets: () => p.getQuantitySets(expressId).map(withLengths),
    typePropertySets: () => p.getTypePropertySets?.(expressId) ?? [],
    typeQuantitySets: () => (p.getTypeQuantitySets?.(expressId) ?? []).map(withLengths),
    materials: () => p.getMaterialNames?.(expressId) ?? [],
    storey: () => p.getStoreyName?.(expressId) ?? '',
    classification: () => tagClassification({ className: p.getEntityTypeName(expressId), typeName: p.getEntityDefiningTypeName?.(expressId) || null, materials: p.getMaterialNames?.(expressId) ?? [], modelId, expressId }),
    lengthUnitScale: () => lengthScale,
    tagFields: useProjectStore.getState().tagFields,
  };
}

/** The element a GlobalId names, as a label reads it; null when no loaded model has it. */
export function labelElementByGlobalId(globalId: string): LabelElement | null {
  const at = elementByGlobalId(globalId);
  return at ? labelElementOf(at.modelId, at.expressId) : null;
}
