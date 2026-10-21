/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a level of the loaded models holds that a section is worth cutting
 * through: its rooms (IfcSpace, named by LongName, else Name) and its stairs,
 * each as a horizontal footprint in the viewer frame, plus the building's.
 * The input of `proposeSections`.
 */

import type { MeshData } from '@ifc-lite/geometry';
import { IfcTypeEnum, type SpatialNode } from '@ifc-lite/data';
import { iterateEffectiveEntityIds } from '@ifc-lite/mutations';
import { useViewerStore } from '@/store';
import { storeyOfElement } from '@/project/effective-storey';
import { createEntityBoundsLookup, unionEntityBounds, type BoundingBox3D } from '@/utils/viewportUtils';
import type { AxisBounds } from '@/lib/section/section-distance';
import type { Footprint, ProposalInput, RoomFootprint } from './section-proposals';
import type { ProjectLevel } from './types';

const footprint = (b: BoundingBox3D): Footprint => ({ min: { x: b.min.x, z: b.min.z }, max: { x: b.max.x, z: b.max.z } });

/** Every IfcSpace under `node`, however deep (spaces may sit in zones or sub-spaces). */
function spacesUnder(node: SpatialNode, out: SpatialNode[] = []): SpatialNode[] {
  for (const child of node.children) {
    if (child.type === IfcTypeEnum.IfcSpace) out.push(child);
    spacesUnder(child, out);
  }
  return out;
}

function findStoreys(node: SpatialNode, wanted: (id: number) => boolean, out: SpatialNode[] = []): SpatialNode[] {
  if (node.type === IfcTypeEnum.IfcBuildingStorey && wanted(node.expressId)) out.push(node);
  for (const child of node.children) findStoreys(child, wanted, out);
  return out;
}

/**
 * The rooms and stairs of `level` across the loaded models, from `meshes`
 * (the federated geometry: ids are express ids plus each model's offset).
 * `null` when there is nothing to span: no bounds yet.
 */
export function proposalInputForLevel(level: ProjectLevel, meshes: MeshData[] | null, bounds: AxisBounds | null): ProposalInput | null {
  if (!bounds) return null;
  const s = useViewerStore.getState();
  const boundsOf = createEntityBoundsLookup(meshes);
  const wanted = new Set(level.storeyGlobalIds);
  const rooms: RoomFootprint[] = [];
  const stairs: Footprint[] = [];
  for (const [modelId, model] of s.models) {
    const store = model.ifcDataStore;
    const hierarchy = store?.spatialHierarchy;
    if (!store || !hierarchy || model.visible === false) continue;
    const offset = model.idOffset ?? 0;
    const storeys = findStoreys(hierarchy.project, (id) => wanted.has(store.entities.getGlobalId(id) ?? ''));
    const storeyIds = new Set(storeys.map((n) => n.expressId));
    for (const storey of storeys) {
      for (const space of spacesUnder(storey)) {
        const b = boundsOf(space.expressId + offset);
        if (b) rooms.push({ id: store.entities.getGlobalId(space.expressId) || `${modelId}#${space.expressId}`, storey: storey.longName || storey.name || undefined, name: space.longName || space.name || `Room ${space.expressId}`, ...footprint(b) });
      }
    }
    const mv = s.mutationViews.get(modelId) ?? null;
    for (const { expressId } of iterateEffectiveEntityIds(store, mv, ['IFCSTAIR', 'IFCSTAIRFLIGHT'])) {
      const storey = storeyOfElement(modelId, expressId);
      if (storey === null || !storeyIds.has(storey)) continue;
      const b = boundsOf(expressId + offset);
      if (b) stairs.push(footprint(b));
    }
  }
  return { building: { min: { x: bounds.min.x, z: bounds.min.z }, max: { x: bounds.max.x, z: bounds.max.z } }, rooms, stairs };
}

/**
 * The extent of the building itself: what the storeys of `levels` contain,
 * without the site, terrain or anything else around it. The set's scales and
 * the sections' cuts are measured on it; `null` when no storey element has
 * geometry yet.
 */
export function buildingExtent(levels: readonly ProjectLevel[], meshes: MeshData[] | null): AxisBounds | null {
  const s = useViewerStore.getState();
  const wanted = new Set(levels.flatMap((l) => l.storeyGlobalIds));
  const ids: number[] = [];
  for (const model of s.models.values()) {
    const store = model.ifcDataStore;
    const hierarchy = store?.spatialHierarchy;
    if (!store || !hierarchy || model.visible === false) continue;
    const offset = model.idOffset ?? 0;
    for (const storey of findStoreys(hierarchy.project, (id) => wanted.has(store.entities.getGlobalId(id) ?? ''))) {
      for (const id of hierarchy.byStorey.get(storey.expressId) ?? []) ids.push(id + offset);
    }
  }
  return ids.length ? unionEntityBounds(meshes, ids, () => null) : null;
}
