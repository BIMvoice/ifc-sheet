/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A level's floor in the frame the meshes are drawn in, which CEILTAG subtracts from a soffit read off
 * those meshes. The storey's `Elevation` attribute is not that height: a model whose real elevation
 * sits in its site or storey placement is meshed at the placement's height, and the viewer may shift
 * the whole frame (origin shift, RTC offset). So: the Z of the storey's placement through every
 * PlacementRelTo hop, less that shift (`dxfElevationRenderY`, `renderY = ifcZ - originShift.y - rtc.z`).
 *
 * TODO(remove-by: #137 merged, Petru): #137 adds the same floor to every live level as `floorY`, read
 * through `levelFloorY`; CEILTAG should read that and this module go.
 */

import type { CoordinateInfo } from '@ifc-lite/geometry';
import type { IfcDataStore } from '@ifc-lite/parser';
import { dxfElevationRenderY } from '@/hooks/dxfUnderlayMath';
import { resolveStoreyOriginMeters } from '@/lib/geo/storey-elevation';
import type { ProjectLevel } from '@/project/types';
import { sameElevation } from '@/project/view-defaults';
import { useViewerStore } from '@/store';
import { ceilingTags, type CeilingMesh, type CeilingTag } from './ceiling-tags';
import type { SheetLocale } from '@bimvoice/ifcsheet/names';

/**
 * The floor of `level` in `frame`: the first storey of `stores` whose GlobalId the level lists and whose
 * placement resolves; failing that, the level's elevation taken as an IFC Z, in the same frame.
 */
export function levelFloorMeshY(level: Pick<ProjectLevel, 'elevation' | 'storeyGlobalIds'>, stores: readonly IfcDataStore[], frame: CoordinateInfo | undefined): number {
  for (const store of stores) {
    for (const id of store.spatialHierarchy?.byStorey.keys() ?? []) {
      if (!level.storeyGlobalIds.includes(store.entities.getGlobalId(id))) continue;
      const origin = resolveStoreyOriginMeters(store, id);
      if (origin && Number.isFinite(origin.z)) return dxfElevationRenderY(frame, origin.z);
    }
  }
  return dxfElevationRenderY(frame, level.elevation);
}

/** The data stores of the loaded models (the single-model store when there is no federation). */
export function loadedDataStores(): IfcDataStore[] {
  const { models, ifcDataStore } = useViewerStore.getState();
  const stores = [...models.values()].flatMap((m) => (m.ifcDataStore ? [m.ifcDataStore] : []));
  return stores.length > 0 || !ifcDataStore ? stores : [ifcDataStore];
}

/**
 * The ceiling tags of a reflected ceiling plan of `level` cut `cutHeight` above its floor: only the coverings whose
 * soffit lies above the cut and below the floor of the next level up (none above the top level), so a plan never
 * tags the ceilings of another storey. Heights are measured from `level`'s floor, all in `frame`.
 */
export function ceilingPlanTags(
  meshes: readonly CeilingMesh[],
  plan: { level: Pick<ProjectLevel, 'elevation' | 'storeyGlobalIds'>; cutHeight: number },
  levels: readonly Pick<ProjectLevel, 'elevation' | 'storeyGlobalIds'>[],
  stores: readonly IfcDataStore[],
  frame: CoordinateInfo | undefined,
  isCeiling: (renderId: number) => boolean,
  locale: SheetLocale = 'en',
): CeilingTag[] {
  const { level, cutHeight } = plan;
  const floor = levelFloorMeshY(level, stores, frame);
  let next: Pick<ProjectLevel, 'elevation' | 'storeyGlobalIds'> | undefined;
  for (const l of levels) {
    if (l.elevation <= level.elevation || sameElevation(l.elevation, level.elevation)) continue;
    if (!next || l.elevation < next.elevation) next = l;
  }
  const below = next ? levelFloorMeshY(next, stores, frame) : Infinity;
  return ceilingTags(meshes, floor, isCeiling, { above: floor + cutHeight, below }, locale);
}
