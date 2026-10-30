/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The elements of a set of storeys, the building a drawing set is framed on and cut from: what each storey contains
 * (IfcRelContainedInSpatialStructure, `byStorey`), then every element the hierarchy puts on one of those storeys through
 * an aggregate (`elementToStorey`): a curtain wall's plates, members and doors, a stair's flights and railings, a wall's
 * IfcBuildingElementPart children. Those parts carry the geometry while their whole often has none, so without them a
 * curtain wall door is on no plan (#586). The storeys' spaces and zones, which `elementToStorey` also maps, stay out:
 * they are rooms, not building elements, and were never framed or cut.
 *
 * The engine (`openModel`) and the app (`buildingFraming` in `project/model-rooms.ts`) both call this, so the extent
 * and the drawings they make from a model cannot disagree about which elements are the building.
 */

import { isSpatialStructureType, type IfcTypeEnum, type SpatialHierarchy } from '@ifc-lite/data';

export function storeyElementIds(
  hierarchy: Pick<SpatialHierarchy, 'byStorey' | 'elementToStorey'>,
  storeys: Iterable<number>,
  typeOf: (expressId: number) => IfcTypeEnum,
): number[] {
  const wanted = new Set(storeys);
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const storey of wanted) {
    for (const id of hierarchy.byStorey.get(storey) ?? []) {
      if (!seen.has(id)) { seen.add(id); ids.push(id); }
    }
  }
  for (const [id, storey] of hierarchy.elementToStorey) {
    if (seen.has(id) || !wanted.has(storey) || isSpatialStructureType(typeOf(id))) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}
