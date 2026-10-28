/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Spatial hierarchy utilities for IFC models
 * Pure functions for building spatial structure from entities and relationships
 * Extracted from useIfc.ts for reusability and testability
 */

import {
  IfcTypeEnum,
  RelationshipType,
  type SpatialHierarchy,
  type EntityTable,
  type RelationshipGraph,
} from '@ifc-lite/data';
import { SpatialHierarchyBuilder } from '@ifc-lite/parser';
import { MATERIAL_DEF_TYPES } from './materialDefinitionTypes';
import { findSpatialNode } from './spatialNode';

/**
 * Rebuild the spatial hierarchy from cache data (entities + relationships only,
 * no source buffer). Thin wrapper over the single canonical builder in
 * `@ifc-lite/parser`, so the cache path cannot drift from the fresh-parse path;
 * storey elevations stay empty without a source buffer (`getStoreyByElevation`
 * returns null).
 *
 * @param entities - Entity table from parsed IFC
 * @param relationships - Relationship graph from parsed IFC
 * @returns Spatial hierarchy or undefined if no project found
 */
export function rebuildSpatialHierarchy(
  entities: EntityTable,
  relationships: RelationshipGraph
): SpatialHierarchy | undefined {
  return new SpatialHierarchyBuilder().buildFromCache(entities, relationships);
}


export { buildSpatialAncestryIndex, collectSpatialContainerNames, type SpatialAncestryIndex } from '@bimvoice/ifcsheet/list-projection';

/**
 * Register a freshly-authored element into an ALREADY-BUILT spatial hierarchy,
 * in place, so it's a first-class citizen the instant it's created — visible in
 * the spatial tree under its storey and resolving its storey assignment.
 *
 * Authored entities live in the store's mutation overlay, not the columnar parse
 * the hierarchy was built from at load, so a full `rebuildSpatialHierarchy` can't
 * see them (and would be O(n) per add anyway). This patches the maps + tree
 * directly, mirroring how each relationship type lands a child:
 *   - A spatial-structure element (IfcSpace / IfcSpatialZone, linked by
 *     IfcRelAggregates) becomes a child NODE of the storey.
 *   - Any other element (slab / wall / … linked by IfcRelContainedInSpatialStructure)
 *     joins the storey's contained-element list (what the tree reads via byStorey).
 * Idempotent. A later export+reparse rebuilds the hierarchy from the real
 * relationships, so this is purely the live-session bridge.
 */
export function registerAuthoredElement(
  hierarchy: SpatialHierarchy,
  storeyExpressId: number,
  entityId: number,
  ifcTypeName: string,
  name: string,
): void {
  hierarchy.elementToStorey.set(entityId, storeyExpressId);

  const upper = ifcTypeName.toUpperCase();
  if (upper === 'IFCSPACE' || upper === 'IFCSPATIALZONE') {
    if (!hierarchy.bySpace.has(entityId)) hierarchy.bySpace.set(entityId, []);
    const storeyNode = findSpatialNode(hierarchy.project, storeyExpressId);
    if (storeyNode && !storeyNode.children.some((c) => c.expressId === entityId)) {
      storeyNode.children.push({
        expressId: entityId,
        type: upper === 'IFCSPATIALZONE' ? IfcTypeEnum.IfcSpatialZone : IfcTypeEnum.IfcSpace,
        name: name || (upper === 'IFCSPATIALZONE' ? 'IfcSpatialZone' : 'IfcSpace'),
        children: [],
        elements: [],
      });
    }
    return;
  }

  const existing = hierarchy.byStorey.get(storeyExpressId);
  if (existing) {
    if (!existing.includes(entityId)) existing.push(entityId);
  } else {
    hierarchy.byStorey.set(storeyExpressId, [entityId]);
  }
  // The storey NODE's `elements` is what the tree walkers read (storey Solo /
  // isolation, the basket, exports). The parser builds it as the same array as
  // `byStorey`, but a hierarchy that crossed a worker or the cache is a copy,
  // so the element has to be listed there too, or Solo hides it (#6232).
  const storeyNode = findSpatialNode(hierarchy.project, storeyExpressId);
  if (storeyNode && storeyNode.elements !== hierarchy.byStorey.get(storeyExpressId) && !storeyNode.elements.includes(entityId)) {
    storeyNode.elements.push(entityId);
  }
}

/**
 * Entity index type for property/quantity set lookup
 */
export interface EntityIndex {
  byId: { get(expressId: number): unknown; has(expressId: number): boolean; readonly size: number };
  byType: Map<string, number[]>;
}

/**
 * Result of rebuilding on-demand maps
 */
export interface OnDemandMaps {
  onDemandPropertyMap: Map<number, number[]>;
  onDemandQuantityMap: Map<number, number[]>;
  /** element/type expressId -> associated material definition expressIds.
   *  A list so multiple IfcRelAssociatesMaterial on one element are preserved,
   *  matching the columnar parser's map shape. */
  onDemandMaterialMap: Map<number, number[]>;
}

/**
 * Rebuild on-demand property/quantity maps from relationships and entity types
 * Uses FORWARD direction: pset -> elements (more efficient than inverse lookup)
 * OPTIMIZED: Uses entityIndex.byType for property/quantity set lookup since
 * the entity table may not include these types (filtered during fresh parse)
 *
 * @param entities - Entity table from parsed IFC
 * @param relationships - Relationship graph from parsed IFC
 * @param entityIndex - Optional entity index with byType map for cache loads
 * @returns Maps from entity ID to property/quantity set IDs
 */
export function rebuildOnDemandMaps(
  entities: EntityTable,
  relationships: RelationshipGraph,
  entityIndex?: EntityIndex
): OnDemandMaps {
  const onDemandPropertyMap = new Map<number, number[]>();
  const onDemandQuantityMap = new Map<number, number[]>();
  const onDemandMaterialMap = new Map<number, number[]>();

  // Cache loads may omit property sets from the entity table.
  let propertySets: number[];
  let quantitySets: number[];

  // @raw-entity-enumeration-ok cache hydration tests the source index before rebuilding parsed associations
  if (entityIndex?.byType) {
    // byType keys are upper case: the parser, the v4 cache columns and the v3
    // rebuild in useIfcCache all normalise them (#4712).
    // @raw-entity-enumeration-ok cache hydration rebuilds source-only property associations before a mutation view exists
    propertySets = entityIndex.byType.get('IFCPROPERTYSET') ?? [];
    // @raw-entity-enumeration-ok cache hydration rebuilds source-only quantity associations before a mutation view exists
    quantitySets = entityIndex.byType.get('IFCELEMENTQUANTITY') ?? [];
  } else {
    // @raw-entity-enumeration-ok source-only fallback while hydrating a parsed cache with no entity index
    propertySets = entities.getByType(IfcTypeEnum.IfcPropertySet);
    // @raw-entity-enumeration-ok source-only fallback while hydrating a parsed cache with no entity index
    quantitySets = entities.getByType(IfcTypeEnum.IfcElementQuantity);
  }

  // Process property sets
  for (const psetId of propertySets) {
    // Get elements defined by this pset (FORWARD: pset -> elements)
    const definedElements = relationships.getRelated(
      psetId,
      RelationshipType.DefinesByProperties,
      'forward'
    );

    for (const entityId of definedElements) {
      let list = onDemandPropertyMap.get(entityId);
      if (!list) {
        list = [];
        onDemandPropertyMap.set(entityId, list);
      }
      list.push(psetId);
    }
  }

  // Process quantity sets
  for (const qsetId of quantitySets) {
    // Get elements defined by this qset (FORWARD: qset -> elements)
    const definedElements = relationships.getRelated(
      qsetId,
      RelationshipType.DefinesByProperties,
      'forward'
    );

    for (const entityId of definedElements) {
      let list = onDemandQuantityMap.get(entityId);
      if (!list) {
        list = [];
        onDemandQuantityMap.set(entityId, list);
      }
      list.push(qsetId);
    }
  }

  // Process material associations (FORWARD: material definition -> elements),
  // mirroring the columnar parser's onDemandMaterialMap. Needed so cache-loaded
  // models populate the Materials tab + per-material totals, which read this map
  // (the relationship-graph fallback only covers single-element lookups, not the
  // model-wide usage index). Requires entityIndex.byType to enumerate material
  // definitions — the cached graph preserves AssociatesMaterial edges.
  let materialDefCount = 0;
  // @raw-entity-enumeration-ok cache hydration tests the source index before rebuilding material associations
  if (entityIndex?.byType) {
    // Determinism parity with the columnar parser: the map preserves EVERY
    // association (multiple IfcRelAssociatesMaterial on one element are
    // valid), list-valued and ordered by rel express id so list[0] is the
    // deterministic primary. The enumeration order here (byType buckets)
    // differs from the parser's file-order scan, so ordering must come from
    // edge relationshipId — which the cached CSR columns preserve — or a
    // cache load could disagree with a fresh parse of the same file.
    const materialRelIds = new Map<number, number[]>();
    // @raw-entity-enumeration-ok source-only cache hydration before any live mutation view exists
    for (const [typeKey, ids] of entityIndex.byType) {
      // Source nodes of AssociatesMaterial edges: every class an
      // IfcMaterialSelect can resolve to. Anything omitted here is an
      // association a fresh parse maps and a cache rebuild drops.
      if (!MATERIAL_DEF_TYPES.has(typeKey.toUpperCase())) continue;
      for (const materialId of ids) {
        materialDefCount += 1;
        const edges = relationships.forward.getEdges(
          materialId,
          RelationshipType.AssociatesMaterial
        );
        for (const edge of edges) {
          let list = onDemandMaterialMap.get(edge.target);
          let relIds = materialRelIds.get(edge.target);
          if (!list || !relIds) {
            list = []; onDemandMaterialMap.set(edge.target, list);
            relIds = []; materialRelIds.set(edge.target, relIds);
          }
          // Insert in rel-express-id order (lists are tiny).
          let at = relIds.length;
          while (at > 0 && relIds[at - 1] > edge.relationshipId) at--;
          relIds.splice(at, 0, edge.relationshipId);
          list.splice(at, 0, materialId);
        }
      }
    }
  }

  console.log(
    `[spatialHierarchy] Rebuilt on-demand maps: ${propertySets.length} psets, ${quantitySets.length} qsets, ${materialDefCount} material defs -> ${onDemandPropertyMap.size} entities with properties, ${onDemandQuantityMap.size} with quantities, ${onDemandMaterialMap.size} with materials`
  );
  return { onDemandPropertyMap, onDemandQuantityMap, onDemandMaterialMap };
}
