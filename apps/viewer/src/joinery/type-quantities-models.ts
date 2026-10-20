/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The loaded models read into `type-quantities.ts`'s input: every
 * geometry-bearing physical element with its defining type, its storey and its Qto
 * quantities in SI. It reads the quantities the way the material takeoff does
 * (the list provider's `getQuantitySets`, the model's units scaled to SI).
 */

import { RelationshipType } from '@ifc-lite/data';
import { extractProjectUnits, getInheritanceChainAcrossSchemas, ProjectUnits } from '@ifc-lite/parser';
import { createListDataProvider } from '@/lib/lists';
import { useViewerStore } from '@/store';
import { quantityScales } from './material-takeoff-models';
import { elementTypeQuantities, type TypeElement } from './type-quantities';

/** Not things a takeoff counts: openings and other features of an element, virtual elements. */
const NOT_PHYSICAL = ['IfcFeatureElement', 'IfcVirtualElement'];
const physicalByClass = new Map<string, boolean>();

/**
 * An IfcElement that is neither a feature of another (IfcOpeningElement, IfcVoidingFeature, ...) nor virtual;
 * spatial entities (site, storey, space) are not IfcElement at all. Read from the schema's inheritance, once per class.
 */
function isPhysicalElement(className: string): boolean {
  let known = physicalByClass.get(className);
  if (known === undefined) {
    const chain = getInheritanceChainAcrossSchemas(className);
    known = chain.includes('IfcElement') && !NOT_PHYSICAL.some((n) => chain.includes(n));
    physicalByClass.set(className, known);
  }
  return known;
}

/**
 * Every element is counted once: an element whose IfcRelAggregates parts are
 * themselves listed (an IfcRoof with its own Body over IfcSlab parts, an
 * IfcStair over IfcStairFlight parts, an IfcCurtainWall over plates and
 * members) is left out, and its parts are counted. Parts are the side that
 * carries the specific Qto (Qto_SlabBaseQuantities, ...), and the rule is the
 * same whichever parent class it is.
 */
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
    const listed = new Set((provider.getAllEntityIds?.() ?? []).filter((id) => isPhysicalElement(provider.getEntityTypeName(id))));
    for (const id of listed) {
      const className = provider.getEntityTypeName(id);
      if (store.relationships?.getRelated(id, RelationshipType.Aggregates, 'forward').some((part) => listed.has(part))) continue;
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
