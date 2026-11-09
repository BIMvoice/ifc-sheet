/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a terrain is, once, for everything that has to tell it from the building (#683): an IfcGeographicElement whose
 * PredefinedType is TERRAIN, NOTDEFINED or not stated. In IFC4.3 the same class also holds VEGETATION (a tree), SOIL_BORING_POINT
 * and USERDEFINED things: those are objects in the landscape, drawn like any other element, not the ground. `storeyElementIds`
 * (what is the building) and `isTerrainMesh` (what is contoured) both ask this.
 */

import type { IfcDataStore } from '@ifc-lite/parser';
import { RelationshipType } from '@ifc-lite/data';
import { resolveEntityPredefinedType } from '@ifc-lite/rules';
import { predefinedTypeText } from './schedule-filter.js';

/** Whether an IfcGeographicElement of this PredefinedType (dots allowed, case ignored; null or empty: not stated) is a terrain. */
export function isTerrainPredefinedType(predefinedType: string | null | undefined): boolean {
  const text = predefinedTypeText(predefinedType ?? null);
  return text === null || text === 'TERRAIN' || text === 'NOTDEFINED';
}

/** What each store's geographic elements stated, by express id: a redraw reads a record once, never again (the read re-parses the STEP record). */
const readCache = new WeakMap<IfcDataStore, Map<number, string | null>>();

/** The text of `id`'s own PredefinedType, or of its IfcGeographicElementType's (IfcRelDefinesByType) when the occurrence states none or NOTDEFINED. */
function predefinedTypeOf(store: IfcDataStore, id: number): string | null {
  const own = predefinedTypeText(store.entities.getPredefinedType?.(id) || resolveEntityPredefinedType(store, id) || null);
  if (own !== null && own !== 'NOTDEFINED') return own;
  const typeId = store.relationships?.getRelated(id, RelationshipType.DefinesByType, 'inverse')[0];
  const inherited = typeId === undefined ? null : predefinedTypeText(resolveEntityPredefinedType(store, typeId) || null);
  return inherited ?? own;
}

/** The PredefinedType of an entity of `store`, as text (the type object's when the occurrence states none); null when neither does. Read once per entity and store. */
export function predefinedTypeReader(store: IfcDataStore): (expressId: number) => string | null {
  let cache = readCache.get(store);
  if (!cache) readCache.set(store, (cache = new Map()));
  const known = cache;
  return (id) => {
    if (known.has(id)) return known.get(id) ?? null;
    const text = predefinedTypeOf(store, id);
    known.set(id, text);
    return text;
  };
}
