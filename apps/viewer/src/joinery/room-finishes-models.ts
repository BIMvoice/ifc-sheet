/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The loaded models read into `room-finishes.ts`'s input: every IfcSpace with
 * the IfcCovering elements related to it by IfcRelCoversSpaces,
 * IfcRelSpaceBoundary and containment, their areas in m², and the room's own
 * finish properties. One pass over the rooms and their relations, never over
 * every element.
 */

import { IfcTypeEnum, RelationshipType, type SpatialNode } from '@ifc-lite/data';
import { extractProjectUnits, ProjectUnits } from '@ifc-lite/parser';
import type { ListDataProvider } from '@/lib/lists';
import type { ScheduleModel } from '@bimvoice/ifcsheet/project';
import { loadedScheduleModels, providerOf } from './schedule-models';
import { quantityScales } from './material-takeoff-models';
import { coveringArea, coveringPredefinedType, type CoveringInput, type RoomInput, type Surface } from './room-finishes';

const BOUNDARY_TYPES = [RelationshipType.SpaceBoundary, RelationshipType.SpaceBoundary1stLevel, RelationshipType.SpaceBoundary2ndLevel] as const;

/** Pset_SpaceCoveringRequirements' property for each surface. */
const FINISH_PROPERTY: Readonly<Record<string, Surface>> = { FloorCovering: 'floor', WallCovering: 'wall', CeilingCovering: 'ceiling' };

interface SpaceAt {
  node: SpatialNode;
  level: string;
  elevation: number | null;
}

/** Every IfcSpace under `node`, with the storey it sits on. */
function spacesOf(node: SpatialNode, storeyElevations: ReadonlyMap<number, number>, at: { level: string; elevation: number | null } = { level: '', elevation: null }, out: SpaceAt[] = []): SpaceAt[] {
  const here = node.type === IfcTypeEnum.IfcBuildingStorey
    ? { level: node.longName || node.name, elevation: storeyElevations.get(node.expressId) ?? node.elevation ?? null }
    : at;
  for (const child of node.children) {
    if (child.type === IfcTypeEnum.IfcSpace) out.push({ node: child, ...here });
    spacesOf(child, storeyElevations, here, out);
  }
  return out;
}

export function collectRoomInputs(models: readonly ScheduleModel[] = loadedScheduleModels()): RoomInput[] {
  const out: RoomInput[] = [];
  for (const model of models) {
    const { modelId, dataStore: store } = model;
    const hierarchy = store.spatialHierarchy;
    if (!hierarchy) continue;
    const provider: ListDataProvider = providerOf(model);
    const areaScale = quantityScales(store.source.length > 0 ? extractProjectUnits(store.source, store.entityIndex) : ProjectUnits.empty()).area;
    const graph = store.relationships;
    const coverings = (ids: readonly number[]): CoveringInput[] => ids
      .filter((id) => provider.getEntityTypeName(id) === 'IfcCovering')
      .map((id) => {
        const typeId = graph?.getRelated(id, RelationshipType.DefinesByType, 'inverse')[0];
        return {
          id: `${modelId}#${id}`,
          name: provider.getEntityName(id) || provider.getEntityDefiningTypeName?.(id) || '',
          predefinedType: coveringPredefinedType(provider.getEntityPredefinedType?.(id) ?? '', typeId === undefined ? '' : provider.getEntityPredefinedType?.(typeId) ?? ''),
          area: coveringArea(provider.getQuantitySets(id), areaScale),
        };
      });
    for (const { node, level, elevation } of spacesOf(hierarchy.project, hierarchy.storeyElevations)) {
      const id = node.expressId;
      const properties: RoomInput['properties'] = {};
      for (const set of provider.getPropertySets(id)) {
        if (set.name !== 'Pset_SpaceCoveringRequirements') continue;
        for (const p of set.properties) {
          const surface = FINISH_PROPERTY[p.name];
          if (surface && p.value !== null && p.value !== undefined && String(p.value).trim()) properties[surface] = String(p.value);
        }
      }
      out.push({
        // `Name` is the number when a `LongName` names the room, else the name.
        number: node.longName ? node.name : '',
        name: node.longName || node.name,
        level,
        elevation,
        covers: coverings(graph?.getRelated(id, RelationshipType.CoversSpaces, 'forward') ?? []),
        boundary: coverings(BOUNDARY_TYPES.flatMap((t) => graph?.getRelated(id, t, 'forward') ?? [])),
        contained: coverings(graph?.getRelated(id, RelationshipType.ContainsElements, 'forward') ?? []),
        properties,
      });
    }
  }
  return out;
}
