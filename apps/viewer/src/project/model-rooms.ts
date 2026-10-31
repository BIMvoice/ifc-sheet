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
import type { IfcDataStore } from '@ifc-lite/parser';
import { IfcTypeEnum, type SpatialNode } from '@ifc-lite/data';
import { iterateEffectiveEntityIds } from '@ifc-lite/mutations';
import { useViewerStore } from '@/store';
import { storeyOfElement } from '@/project/effective-storey';
import { createEntityBoundsLookup, type BoundingBox3D } from '@/utils/viewportUtils';
import { buildingElementIds, farElementLabel, frameEntities } from '@bimvoice/ifcsheet';
import type { FarElementFact } from '@bimvoice/ifcsheet/readiness';
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

/** The building's frame and the small elements it leaves out for lying far from it, named for a message. */
export interface BuildingFraming {
  extent: AxisBounds | null;
  far: FarElementFact[];
}

/**
 * The extent of the building itself: what the storeys of `levels` contain and
 * the parts aggregated under it (`buildingElementIds`, the elements the engine
 * frames and cuts too), without the site, terrain or anything else around it, and without the small
 * stray elements far from it (a survey point, an origin cube: `frameEntities`
 * in `@bimvoice/ifcsheet`, the rule the command line frames by too). The set's
 * scales and the sections' cuts are measured on it; `extent` is `null` when no
 * storey element has geometry yet. With `includeFar` (the project setting
 * "include far-away elements in framing") nothing is left out.
 */
export function buildingFraming(levels: readonly ProjectLevel[], meshes: MeshData[] | null, includeFar = false): BuildingFraming {
  const s = useViewerStore.getState();
  const wanted = new Set(levels.flatMap((l) => l.storeyGlobalIds));
  const ids: number[] = [];
  const owner = new Map<number, { store: IfcDataStore; expressId: number }>();
  for (const model of s.models.values()) {
    const store = model.ifcDataStore;
    const hierarchy = store?.spatialHierarchy;
    if (!store || !hierarchy || model.visible === false) continue;
    const offset = model.idOffset ?? 0;
    // `wanted` is empty until the project has read its levels from the model: then every storey counts, as the levels will (#618).
    for (const id of buildingElementIds(store, wanted.size > 0 ? wanted : undefined)) {
      ids.push(id + offset);
      owner.set(id + offset, { store, expressId: id });
    }
  }
  if (ids.length === 0) return { extent: null, far: [] };
  const framing = frameEntities(meshes, ids, { includeFar });
  const far = framing.farElements.map((f) => {
    const at = owner.get(f.key);
    const label = at ? farElementLabel({ name: at.store.entities.getName(at.expressId), type: at.store.entities.getTypeName(at.expressId), globalId: at.store.entities.getGlobalId(at.expressId) }) : `#${f.key}`;
    return { label, distance: f.distance };
  });
  return { extent: framing.extent, far };
}

/** {@link buildingFraming}'s extent. */
export function buildingExtent(levels: readonly ProjectLevel[], meshes: MeshData[] | null, includeFar = false): AxisBounds | null {
  return buildingFraming(levels, meshes, includeFar).extent;
}
