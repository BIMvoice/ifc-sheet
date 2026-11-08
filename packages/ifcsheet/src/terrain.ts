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
import { resolveEntityPredefinedType } from '@ifc-lite/rules';
import { predefinedTypeText } from './schedule-filter.js';

/** Whether an IfcGeographicElement of this PredefinedType (dots allowed, case ignored; null or empty: not stated) is a terrain. */
export function isTerrainPredefinedType(predefinedType: string | null | undefined): boolean {
  const text = predefinedTypeText(predefinedType ?? null);
  return text === null || text === 'TERRAIN' || text === 'NOTDEFINED';
}

/** The PredefinedType of an entity of `store`, as text; null when it states none. */
export function predefinedTypeReader(store: IfcDataStore): (expressId: number) => string | null {
  return (id) => predefinedTypeText(store.entities.getPredefinedType?.(id) || resolveEntityPredefinedType(store, id) || null);
}
