/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The rooms of a parsed model as `RoomRecord`s (#42), for the command line:
 * every IfcSpace with its level, its number and name, and its area decided by
 * `room-areas.ts`, the rule the app reads the rooms by too (`urban-models.ts`
 * and `rooms/room-records.ts` in the app give the same records for the same
 * model; a test reads both over AC20-FZK-Haus). Loads the parser, so it is in
 * the headless entry.
 */

import { IfcTypeEnum, RelationshipType, type QuantitySet, type SpatialNode } from '@ifc-lite/data';
import type { MeshData } from '@ifc-lite/geometry';
import { extractAllEntityAttributes, extractProjectUnits, extractQuantitiesOnDemand, ProjectUnits, type IfcDataStore } from '@ifc-lite/parser';
import { meshFootprintArea, roomArea, spaceRole, type SpaceRole } from './room-areas.js';
import type { RoomRecord, ScheduleLevelInfo } from './room-schedule.js';

export interface RoomsRead {
  levels: ScheduleLevelInfo[];
  /** The rooms, in model order; the spaces that are not rooms are counted in `leftOut`. */
  rooms: RoomRecord[];
  leftOut: { external: number; gfa: number; parents: number };
}

/** The model's area unit in m²: its AREAUNIT, else the length unit squared. */
export function areaScaleOf(units: ProjectUnits): number {
  const length = units.unitForMeasure('IfcLengthMeasure')?.siScale ?? 1;
  return units.resolvedForUnitType('AREAUNIT')?.siScale ?? length ** 2;
}

interface SpaceAt {
  node: SpatialNode;
  storey: number | null;
}

function spacesUnder(node: SpatialNode, storey: number | null, out: SpaceAt[] = []): SpaceAt[] {
  const here = node.type === IfcTypeEnum.IfcBuildingStorey ? node.expressId : storey;
  for (const child of node.children) {
    if (child.type === IfcTypeEnum.IfcSpace) out.push({ node: child, storey: here });
    spacesUnder(child, here, out);
  }
  return out;
}

function quantitySetsOf(ds: IfcDataStore, id: number): QuantitySet[] {
  if (ds.onDemandQuantityMap && ds.source?.length > 0) return extractQuantitiesOnDemand(ds, id) as QuantitySet[];
  return (ds.quantities?.getForEntity(id) ?? []) as QuantitySet[];
}

/** `meshes`: the model's meshes, for a room whose model states no area (their footprint is taken); without them such a room has none. */
export function readRooms(ds: IfcDataStore, meshes: readonly MeshData[] = []): RoomsRead {
  const hierarchy = ds.spatialHierarchy;
  const empty: RoomsRead = { levels: [], rooms: [], leftOut: { external: 0, gfa: 0, parents: 0 } };
  if (!hierarchy) return empty;
  const storeyIds = [...hierarchy.byStorey.keys()];
  const levels = storeyIds.map((id): ScheduleLevelInfo => ({ name: ds.entities.getName(id) || `Storey #${id}`, elevation: hierarchy.storeyElevations.get(id) ?? null }));
  const scale = areaScaleOf(ds.source?.length > 0 ? extractProjectUnits(ds.source, ds.entityIndex) : ProjectUnits.empty());
  const meshesOf = new Map<number, MeshData[]>();
  const spaces = spacesUnder(hierarchy.project, null);
  const wanted = new Set(spaces.map((s) => s.node.expressId));
  for (const m of meshes) if (wanted.has(m.expressId)) (meshesOf.get(m.expressId) ?? meshesOf.set(m.expressId, []).get(m.expressId)!).push(m);
  const isSpace = (id: number) => (ds.entities.getTypeName(id) ?? '').toUpperCase() === 'IFCSPACE';
  const out = { ...empty, levels, rooms: [] as RoomRecord[] };
  for (const { node, storey } of spaces) {
    const id = node.expressId;
    const predefined = String(extractAllEntityAttributes(ds, id).find((a) => a.name === 'PredefinedType')?.value ?? '');
    const parent = ds.relationships?.getRelated(id, RelationshipType.Aggregates, 'forward').some(isSpace) ?? false;
    const role: SpaceRole = spaceRole(predefined, parent);
    if (role !== 'room') { out.leftOut[role === 'external' ? 'external' : role === 'gfa' ? 'gfa' : 'parents']++; continue; }
    const held = meshesOf.get(id);
    const { area, source } = roomArea(quantitySetsOf(ds, id), scale, held ? () => meshFootprintArea(held) : undefined);
    const level = storey === null ? -1 : storeyIds.indexOf(storey);
    out.rooms.push({ id: ds.entities.getGlobalId(id) || `#${id}`, number: node.longName ? node.name : '', name: node.longName || node.name, level: level < 0 ? null : level, area, source });
  }
  return out;
}
