/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Lists engine's data provider over a model the engine read headlessly (#78): the `ListDataProvider` of `@ifc-lite/lists`, answered from
 * a parsed `IfcDataStore`, so `executeList` (and everything `list-run.ts` makes of it) runs unchanged on the command line and in the MCP tools.
 *
 * It answers every question the way the app's provider (`apps/viewer/src/lib/lists/adapter.ts`) answers it for a model with no edits: the
 * same parser extractors for attributes, property and quantity sets (on demand from the source, else from the tables), the same Type
 * fallback (sets defined once on the IfcTypeProduct, cached by type), the same class names (`exactTypeName`), the same spatial ancestry
 * (`buildSpatialAncestryIndex`). What it leaves out is what a headless read has none of: the edit overlay (a mutation view), the zone
 * sets and the world position of an element, which the app's provider answers `null` for as well when no zone context is given.
 * `list-provider.fzk.test.ts` and the app's `list-schedule.fzk.test.tsx` hold the two to each other, question by question, on a model.
 */

import { RelationshipType, exactTypeName, type PropertySet, type QuantitySet } from '@ifc-lite/data';
import type { ListClassificationRef, ListDataProvider } from '@ifc-lite/lists';
import {
  extractAllMaterialsOnDemand, extractClassificationsOnDemand, extractEntityAttributesOnDemand, extractPropertiesOnDemand, extractQuantitiesOnDemand,
  extractTypePropertiesOnDemand, extractTypeQuantitiesOnDemand, type IfcDataStore,
} from '@ifc-lite/parser';
import { resolveEntityPredefinedType } from '@ifc-lite/rules';
import { materialNamesOf } from './boq-read.js';
import { buildSpatialAncestryIndex, type SpatialAncestryIndex } from './list-spatial-ancestry.js';

/** A `ListDataProvider` over a parsed model. `modelName` is what the `model` column prints (the file's name). */
export function createHeadlessListProvider(store: IfcDataStore, modelName = ''): ListDataProvider {
  const attrCache = new Map<number, { description: string; objectType: string; tag: string }>();
  const onDemandAttrs = (id: number) => {
    let found = attrCache.get(id);
    if (!found) {
      if (store.source?.length > 0 && store.entityIndex) {
        const a = extractEntityAttributesOnDemand(store, id);
        found = { description: a.description, objectType: a.objectType, tag: a.tag };
      } else found = { description: '', objectType: '', tag: '' };
      attrCache.set(id, found);
    }
    return found;
  };
  const predefCache = new Map<number, string>();
  const predefinedOf = (id: number): string => {
    let value = predefCache.get(id);
    if (value === undefined) { value = store.entities.getPredefinedType?.(id) || resolveEntityPredefinedType(store, id) || ''; predefCache.set(id, value); }
    return value;
  };
  let ancestryCache: SpatialAncestryIndex | null = null;
  const ancestry = (): SpatialAncestryIndex => (ancestryCache ??= buildSpatialAncestryIndex(store.spatialHierarchy, (id) => store.entities.getName(id), (id) => store.entities.getTypeName(id)));
  let selectable: number[] | null = null;
  const selectableIds = (): number[] => {
    if (!selectable) {
      selectable = [];
      const col = store.entities.expressId;
      for (let i = 0; i < col.length; i++) if (col[i] && store.entities.hasGeometry(col[i])) selectable.push(col[i]);
    }
    return selectable;
  };

  const onDemandProps = !!store.onDemandPropertyMap && store.source?.length > 0;
  const onDemandQtos = !!store.onDemandQuantityMap && store.source?.length > 0;
  const propertySets = (id: number): PropertySet[] => (onDemandProps ? (extractPropertiesOnDemand(store, id) as PropertySet[]) : store.properties?.getForEntity(id) ?? []);
  const quantitySets = (id: number): QuantitySet[] => (onDemandQtos ? (extractQuantitiesOnDemand(store, id) as QuantitySet[]) : store.quantities?.getForEntity(id) ?? []);

  // The element's IfcTypeProduct, resolved once; the type's own sets are extracted once per type, however many occurrences share it.
  const typeOf = new Map<number, number>();
  const definingTypeId = (id: number): number => {
    let typeId = typeOf.get(id);
    if (typeId === undefined) { typeId = store.relationships?.getRelated(id, RelationshipType.DefinesByType, 'inverse')[0] ?? -1; typeOf.set(id, typeId); }
    return typeId;
  };
  const typePsets = new Map<number, PropertySet[]>();
  const typeQsets = new Map<number, QuantitySet[]>();

  return {
    getEntitiesByType: (type) => store.entities.getByType(type),
    getEntityName: (id) => store.entities.getName(id),
    getEntityGlobalId: (id) => store.entities.getGlobalId(id),
    getEntityDescription: (id) => store.entities.getDescription(id) || onDemandAttrs(id).description,
    getEntityObjectType: (id) => store.entities.getObjectType(id) || onDemandAttrs(id).objectType,
    getEntityPredefinedType: predefinedOf,
    getEntityTag: (id) => store.entities.getTag?.(id) || onDemandAttrs(id).tag,
    getEntityTypeName: (id) => exactTypeName(store.entities, id),
    getEntityDefiningTypeName(id) {
      const typeId = definingTypeId(id);
      return typeId >= 0 ? store.entities.getName(typeId) || '' : '';
    },
    getPropertySets: propertySets,
    getQuantitySets: quantitySets,
    getTypePropertySets(id) {
      const typeId = definingTypeId(id);
      if (typeId < 0) return [];
      let sets = typePsets.get(typeId);
      if (!sets) { sets = onDemandProps ? ((extractTypePropertiesOnDemand(store, id)?.properties ?? []) as PropertySet[]) : store.properties?.getForEntity(typeId) ?? []; typePsets.set(typeId, sets); }
      return sets;
    },
    getTypeQuantitySets(id) {
      const typeId = definingTypeId(id);
      if (typeId < 0) return [];
      let sets = typeQsets.get(typeId);
      if (!sets) { sets = onDemandQtos ? ((extractTypeQuantitiesOnDemand(store, id)?.quantities ?? []) as QuantitySet[]) : store.quantities?.getForEntity(typeId) ?? []; typeQsets.set(typeId, sets); }
      return sets;
    },
    getAllEntityIds: selectableIds,
    getMaterialNames: (id) => [...new Set(extractAllMaterialsOnDemand(store, id).flatMap(materialNamesOf))],
    getClassifications: (id): ListClassificationRef[] => extractClassificationsOnDemand(store, id).map((c) => ({ system: c.system, code: c.identification, name: c.name })),
    getStoreyName(id) {
      const storeyId = store.spatialHierarchy?.elementToStorey.get(id);
      return storeyId ? store.entities.getName(storeyId) || '' : '';
    },
    getAggregateParents: (id) => store.relationships?.getRelated(id, RelationshipType.Aggregates, 'inverse') ?? [],
    getContainerName: (id) => ancestry().containerOf(id),
    getBuildingName: (id) => ancestry().buildingOf(id),
    getSiteName: (id) => ancestry().siteOf(id),
    getProjectName: () => ancestry().projectName,
    getModelName: () => modelName,
    getWorldPosition: () => null,
  };
}
