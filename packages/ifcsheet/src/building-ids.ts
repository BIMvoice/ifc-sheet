/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Which elements of a parsed model are the building the drawing set is framed
 * on (#618). The engine (`openModel`) and the app (`buildingFraming` in
 * `project/model-rooms.ts`) both ask here, so the extent, and with it the
 * paper and the scale of every sheet, cannot differ between them.
 *
 * `only` is the storeys the caller wants, by GlobalId. Without it every storey
 * of the model counts: that is what the project's level list holds once it has
 * been read from the model, so a caller whose level list is not read yet (the
 * Wall starts the set the moment the geometry is in, before the project has
 * synced its levels) still frames on the building and not on the site around it.
 */

import { IfcTypeEnum, type SpatialNode } from '@ifc-lite/data';
import type { IfcDataStore } from '@ifc-lite/parser';
import { storeyElementIds } from './storey-elements.js';

type Entities = Pick<IfcDataStore['entities'], 'getGlobalId' | 'getTypeEnum'>;

function storeysIn(node: SpatialNode, wanted: (id: number) => boolean, out: number[] = []): number[] {
  if (node.type === IfcTypeEnum.IfcBuildingStorey && wanted(node.expressId)) out.push(node.expressId);
  for (const child of node.children) storeysIn(child, wanted, out);
  return out;
}

/** The express ids of the building's elements on the storeys of `only` (every storey when absent), as `storeyElementIds` reads them. */
export function buildingElementIds(store: { spatialHierarchy?: IfcDataStore['spatialHierarchy']; entities: Entities }, only?: ReadonlySet<string>): number[] {
  const hierarchy = store.spatialHierarchy;
  if (!hierarchy) return [];
  const storeys = storeysIn(hierarchy.project, (id) => !only || only.has(store.entities.getGlobalId(id) ?? ''));
  return storeyElementIds(hierarchy, storeys, (id) => store.entities.getTypeEnum(id));
}
