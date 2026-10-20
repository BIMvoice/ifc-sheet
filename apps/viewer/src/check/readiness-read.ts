/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The loaded models counted into `ModelFacts`: one pass over each entity table, no geometry and no STEP decoding. */

import { getInheritanceChainAcrossSchemas, resolveAllMaterialDefIds, type IfcDataStore } from '@ifc-lite/parser';
import { useViewerStore } from '@/store';
import { modelLevels } from '@/project/model-levels';
import type { ModelFacts } from './readiness';

/**
 * An IFC GlobalId: 22 characters of the base-64 alphabet, the first of them 0-3 (it carries two bits).
 * The table's GlobalId column holds the first string of entities that have no GlobalId too (an IfcMaterial's
 * Name, an IfcSurfaceStyle's Name), so only a GUID-shaped value counts.
 */
export const IFC_GUID = /^[0-3][0-9A-Za-z_$]{21}$/;

/** Not physical things a drawing shows or a takeoff counts: openings and other features of an element, virtual elements. */
const NOT_PHYSICAL = ['IfcFeatureElement', 'IfcVirtualElement'];

const physicalByType = new Map<string, boolean>();
/**
 * A physical element: an IfcElement that is not a feature of another (IfcOpeningElement, IfcVoidingFeature, ...)
 * nor virtual. Spatial entities (site, storey, space, spatial zone) and annotations are not IfcElement at all.
 * Read from the schema's inheritance, once per class.
 */
export function isPhysicalElement(typeName: string): boolean {
  let known = physicalByType.get(typeName);
  if (known === undefined) {
    const chain = getInheritanceChainAcrossSchemas(typeName);
    known = chain.includes('IfcElement') && !NOT_PHYSICAL.some((n) => chain.includes(n));
    physicalByType.set(typeName, known);
  }
  return known;
}

export interface FactSource { store: IfcDataStore; storeys: number }

/** Counts over the stores; element GlobalIds are compared across all of them, as a tag finds its element in whichever model holds it. */
export function readModelFacts(sources: Iterable<FactSource>): ModelFacts {
  const facts: ModelFacts = { storeys: 0, spaces: 0, elements: 0, elementsWithoutStorey: 0, elementsWithoutMaterial: 0, elementsWithoutQuantities: 0, duplicateGlobalIds: 0, duplicatedEntities: 0 };
  const seen = new Map<string, number>();
  for (const { store, storeys } of sources) {
    const { entities, entityIndex, spatialHierarchy } = store;
    facts.storeys += storeys;
    facts.spaces += entityIndex.byType.get('IFCSPACE')?.length ?? 0;
    for (let i = 0; i < entities.count; i++) {
      const id = entities.expressId[i];
      if (!isPhysicalElement(entities.getTypeName(id))) continue;
      // Elements only: discipline models of one building share the project, site and storey GlobalIds by design.
      const guid = entities.getGlobalId(id);
      if (IFC_GUID.test(guid)) seen.set(guid, (seen.get(guid) ?? 0) + 1);
      if (!entities.hasGeometry(id)) continue;
      facts.elements++;
      // On a storey directly, or in a room (IfcSpace) that is on one.
      const onStorey = (k: number | undefined): boolean => k !== undefined && (spatialHierarchy?.elementToStorey.has(k) ?? false);
      if (!onStorey(id) && !onStorey(spatialHierarchy?.elementToContainer?.get(id))) facts.elementsWithoutStorey++;
      if (resolveAllMaterialDefIds(store, id).length === 0) facts.elementsWithoutMaterial++;
      // A client parse keeps quantity sets on demand, a server parse in the table.
      if (!store.onDemandQuantityMap?.has(id) && !store.quantities.entityIndex.has(id)) facts.elementsWithoutQuantities++;
    }
  }
  for (const n of seen.values()) if (n > 1) { facts.duplicateGlobalIds++; facts.duplicatedEntities += n; }
  return facts;
}

/** The facts of the models open now (hidden ones included: the set is drawn from all). */
export function currentModelFacts(): ModelFacts {
  const s = useViewerStore.getState();
  const sources: FactSource[] = [];
  for (const [modelId, model] of s.models) if (model.ifcDataStore) sources.push({ store: model.ifcDataStore, storeys: modelLevels(modelId).length });
  return readModelFacts(sources);
}
