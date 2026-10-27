/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { parseIfcx, IFCX_LENGTH_UNIT_SCALE } from '@ifc-lite/ifcx';
import { declareLengthUnitScale } from './declared-length-unit.js';
import { attachDataStoreAccessors, type IfcStoreData } from './data-store-accessors.js';
import { contiguousSourceBytes, type IfcSourceBytes } from './source-bytes.js';
import type { IfcDataStore } from './columnar-parser.js';

/**
 * The slice of an IFCX parse result the data store is built from. `spatialHierarchy`
 * is only carried into the store (never read here), so it is optional — which keeps
 * the regression test from having to fabricate a full hierarchy.
 */
type IfcxParse = Awaited<ReturnType<typeof parseIfcx>>;
type IfcxStoreInput = Pick<
  IfcxParse,
  'fileSize' | 'entityCount' | 'parseTime' | 'strings' | 'entities' | 'properties' | 'quantities' | 'relationships' | 'georeferencing'
> & { spatialHierarchy?: IfcxParse['spatialHierarchy']; derivedEntities?: IfcxParse['derivedEntities'] };

/**
 * Build the `IfcDataStore` for an IFCX import. Exported for regression coverage of
 * the selection-time accessor path (see viewerModelIngest.test.ts).
 *
 * IFCX carries real data tables, so unlike the GLB path we can't route through
 * `createSyntheticDataStore` (it builds empty tables) — we attach the accessors to
 * the populated store instead. Without this, selecting an entity in an IFCX-imported
 * model threw "this.store.getQuantities is not a function".
 *
 * `attachDataStoreAccessors` then wires `getEntity`/`getEntitiesByType` through the
 * STEP `BufferEntitySource`, which cannot read an IFCX store (the source is IFCX JSON
 * and the byte index is empty) and would return null/[] for every entity. We override
 * both to serve the `IfcEntity` contract from the populated IFCX entity table. (Raw
 * STEP attribute lists don't exist for IFCX, so `attributes` is empty — identity rides
 * `type`, and name/GlobalId come from the entity table via the store's other accessors.)
 */
export function buildIfcxDataStore(ifcxResult: IfcxStoreInput, buffer: ArrayBuffer): IfcDataStore {
  // Annotated deliberately. The object literal below ends in `as unknown as
  // IfcStoreData` (the IFCX tables do not have the STEP shape), and that cast
  // silences every field inside it -- including this one. When `source` became
  // an accessor (#2183) this producer kept handing over a bare Uint8Array and
  // the whole-monorepo typecheck stayed green, so every IFCX model reached
  // consumers calling `.materialize()` on a plain array. The annotation puts a
  // compiler gate back on the one field the cast must not be allowed to cover.
  const source: IfcSourceBytes = contiguousSourceBytes(new Uint8Array(buffer));
  const dataStore = attachDataStoreAccessors({
    fileSize: ifcxResult.fileSize,
    schemaVersion: 'IFC5' as const,
    // The unit IFCX defines (no IfcUnitAssignment to read): consumers that read `store.lengthUnitScale` get it here ...
    lengthUnitScale: IFCX_LENGTH_UNIT_SCALE,
    entityCount: ifcxResult.entityCount,
    parseTime: ifcxResult.parseTime,
    source,
    entityIndex: { byId: new Map(), byType: new Map() },
    strings: ifcxResult.strings,
    entities: ifcxResult.entities,
    derivedEntities: ifcxResult.derivedEntities,
    properties: ifcxResult.properties,
    quantities: ifcxResult.quantities,
    relationships: ifcxResult.relationships,
    spatialHierarchy: ifcxResult.spatialHierarchy,
    georeferencing: ifcxResult.georeferencing ? {
      hasGeoreference: true, source: 'mapConversion',
      projectedCRS: { id: 0, name: ifcxResult.georeferencing.IfcProjectedCRS.Name, mapUnit: 'METRE', mapUnitScale: 1 },
      mapConversion: { id: 0, sourceCRS: 0, targetCRS: 0,
        eastings: ifcxResult.georeferencing.IfcMapConversion.Eastings,
        northings: ifcxResult.georeferencing.IfcMapConversion.Northings,
        orthogonalHeight: ifcxResult.georeferencing.IfcMapConversion.OrthogonalHeight,
        xAxisAbscissa: ifcxResult.georeferencing.IfcMapConversion.XAxisAbscissa,
        xAxisOrdinate: ifcxResult.georeferencing.IfcMapConversion.XAxisOrdinate,
        scale: ifcxResult.georeferencing.IfcMapConversion.Scale,
      },
    } : undefined,
  } as unknown as IfcStoreData);

  // ... and the ones that derive it from `source` and `entityIndex` get it from the parser's declared scales.
  declareLengthUnitScale(dataStore.entityIndex, IFCX_LENGTH_UNIT_SCALE);

  const entityTable = ifcxResult.entities;
  const idsByType = new Map<string, number[]>();
  const knownIds = new Set<number>();
  for (const id of entityTable.expressId) {
    if (!id) continue;
    knownIds.add(id);
    const key = entityTable.getTypeName(id).toUpperCase();
    const bucket = idsByType.get(key);
    if (bucket) bucket.push(id);
    else idsByType.set(key, [id]);
  }
  // The one attribute IFCX records hold: an IfcMaterial's Name (EXPRESS attribute 0, as IfcMaterial has no IfcRoot
  // before it), which the material readers take from the record the way they do for a STEP IfcMaterial.
  const attributesOf = (expressId: number, type: string): string[] => (type === 'IfcMaterial' ? [entityTable.getName(expressId)] : []);
  dataStore.getEntity = (expressId) =>
    knownIds.has(expressId)
      ? { expressId, type: entityTable.getTypeName(expressId), attributes: attributesOf(expressId, entityTable.getTypeName(expressId)) }
      : null;
  dataStore.getEntitiesByType = (typeName) =>
    (idsByType.get(typeName.toUpperCase()) ?? []).map((expressId) => ({
      expressId,
      type: entityTable.getTypeName(expressId),
      attributes: [],
    }));

  return dataStore;
}

