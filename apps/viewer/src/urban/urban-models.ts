/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The loaded models read into `urbanIndicators`' input: one storey per
 * project level (a level spans the models that have it), its footprint from
 * the rendered meshes of what stands on it (`footprint.ts`), every room's
 * floor area, and the site area the model states. Reads the stores; the wasm
 * module must be initialised.
 *
 * - Rooms (Au): every IfcSpace except an EXTERNAL one (balcony, terrace), a
 *   GFA one (an area-scheme space) and a space that aggregates spaces of its
 *   own (only the leaves are rooms, so nothing is counted twice); those are
 *   left out and counted in `spacesLeftOut`. INTERNAL, NOTDEFINED, unset,
 *   SPACE, PARKING and USERDEFINED all count: most tools type an ordinary
 *   room SPACE. The type is the PredefinedType (IFC2X3: InteriorOrExteriorSpace,
 *   in the same slot).
 *   The area is NetFloorArea, else GrossFloorArea, from
 *   `Qto_SpaceBaseQuantities` first and then any quantity set (ArchiCAD
 *   writes them to `BaseQuantities`), in SI like the material takeoff; when
 *   the model states neither, the footprint of the space's geometry. Both
 *   rules are the engine's (`room-areas.ts` in `@bimvoice/ifcsheet`), and
 *   `collectRoomRecords` below is the one read of the rooms: Au and the room
 *   and area schedule both take their rooms from it, so they cannot differ.
 *   The category is the room's ObjectType, else its LongName, else its Name.
 * - Site area: the IfcSite's GrossArea quantity, when positive.
 * - The building's ElevationOfRefHeight, in metres, for finding ±0.00.
 *
 * The attributes read off the source (a space's LongName and PredefinedType,
 * a slab's PredefinedType, the building's reference elevation) are parsed
 * once per model and entity; an edit to them is read from the model's
 * mutation view on top.
 */

import { extractAllEntityAttributes, extractProjectUnits, ProjectUnits, type IfcDataStore } from '@ifc-lite/parser';
import { RelationshipType } from '@ifc-lite/data';
import { iterateEffectiveEntityIds, type MutablePropertyView } from '@ifc-lite/mutations';
import { createListDataProvider } from '@/lib/lists';
import { useViewerStore } from '@/store';
import { useProjectStore } from '@/project/project-store';
import { storeyOfElement } from '@/project/effective-storey';
import { quantityScales } from '@/joinery/material-takeoff-models';
import { meshFootprintArea, pickArea, roomArea, spaceRole, type RoomRecord } from '@bimvoice/ifcsheet';
import type { ProjectLevel } from '@/project/types';
import { getGlobalRenderer } from '@/hooks/useBCF';
import { storeyFootprint, type PlanMesh } from './footprint';
import type { SpaceInput, StoreyInput } from './indicators';

/** What draws a storey's outline. */
const ENCLOSURE = new Set(['IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCWALLELEMENTEDCASE', 'IFCCOLUMN', 'IFCCOLUMNSTANDARDCASE', 'IFCCURTAINWALL']);

export interface UrbanAreas {
  storeys: StoreyInput[];
  /** The rooms Au sums. */
  spaces: SpaceInput[];
  /** Spaces that are not rooms: EXTERNAL ones, GFA (area-scheme) ones, and spaces split into spaces of their own. */
  spacesLeftOut: { external: number; gfa: number; parents: number };
  /** m² the model states for its site, or null. */
  modelSiteArea: number | null;
  /** The first building's ElevationOfRefHeight in metres, or null. */
  buildingRefElevation: number | null;
  /** Names of the levels whose holes were all taken as inside (walls, no slab or room). */
  assumedInterior: string[];
}


type SourceAttrs = ReadonlyMap<string, string | number | boolean>;
const attrsByStore = new WeakMap<IfcDataStore, Map<number, SourceAttrs>>();
/** An entity's attributes off the model source, parsed once per model and entity. */
function sourceAttrs(store: IfcDataStore, id: number): SourceAttrs {
  let byId = attrsByStore.get(store);
  if (!byId) attrsByStore.set(store, (byId = new Map()));
  let attrs = byId.get(id);
  if (!attrs) {
    attrs = store.source.length > 0 ? new Map(extractAllEntityAttributes(store, id).map((a) => [a.name, a.value])) : new Map();
    byId.set(id, attrs);
  }
  return attrs;
}

/** A text attribute as edited, else as the source has it; an enumeration without its dots, upper case. */
function textAttr(store: IfcDataStore, view: MutablePropertyView | undefined, id: number, name: string): string {
  const edited = view?.getAttributeMutationsForEntity(id).find((m) => m.name === name);
  const v = edited ? edited.value : sourceAttrs(store, id).get(name);
  return typeof v === 'string' ? v : '';
}
const enumAttr = (store: IfcDataStore, view: MutablePropertyView | undefined, id: number, name: string) => textAttr(store, view, id, name).replace(/\./g, '').toUpperCase();

/** The engine's: the first of `names` found, preferring the set named `preferred`; in SI. */
export { pickArea };

const scalesByStore = new WeakMap<IfcDataStore, ReturnType<typeof quantityScales> & { length: number }>();
/** The SI scales of a model's quantities and lengths, read from its source once (an edit does not change the project's units). */
function scalesOf(store: IfcDataStore): ReturnType<typeof quantityScales> & { length: number } {
  let scales = scalesByStore.get(store);
  if (!scales) {
    const units = store.source.length > 0 ? extractProjectUnits(store.source, store.entityIndex) : ProjectUnits.empty();
    scales = { ...quantityScales(units), length: units.unitForMeasure('IfcLengthMeasure')?.siScale ?? 1 };
    scalesByStore.set(store, scales);
  }
  return scales;
}

/** The first visible building's ElevationOfRefHeight, metres; null when no model states one. */
function buildingRefElevation(): number | null {
  const s = useViewerStore.getState();
  for (const [modelId, model] of s.models) {
    const store = model.ifcDataStore;
    if (!store || model.visible === false) continue;
    const view = s.mutationViews.get(modelId) ?? null;
    for (const { expressId: id } of iterateEffectiveEntityIds(store, view, ['IFCBUILDING'])) {
      const edited = view?.getAttributeMutationsForEntity(id).find((m) => m.name === 'ElevationOfRefHeight');
      const v = edited ? edited.value : sourceAttrs(store, id).get('ElevationOfRefHeight');
      if (typeof v === 'number' && Number.isFinite(v)) return v * scalesOf(store).length;
    }
  }
  return null;
}

/** The first positive IfcSite GrossArea among the visible models, m²; null when none states one. */
export function modelSiteArea(): number | null {
  const s = useViewerStore.getState();
  for (const [modelId, model] of s.models) {
    const store = model.ifcDataStore;
    if (!store || model.visible === false) continue;
    const view = s.mutationViews.get(modelId) ?? undefined;
    const provider = createListDataProvider(store, model.name, undefined, view);
    const scale = scalesOf(store).area;
    for (const { expressId: id } of iterateEffectiveEntityIds(store, view ?? null, ['IFCSITE'])) {
      const area = pickArea(provider.getQuantitySets(id), 'Qto_SiteBaseQuantities', ['GrossArea'], scale);
      if (area !== null && area > 0) return area;
    }
  }
  return null;
}

/** The project level (index into `levels`) of an element of model `modelId`, by its storey; null when it has none. */
function levelResolver(modelId: string, store: IfcDataStore, levels: readonly ProjectLevel[]): (id: number) => number | null {
  const levelOfStorey = new Map<number, number>();
  for (const storeyId of store.spatialHierarchy?.byStorey.keys() ?? []) {
    const gid = store.entities.getGlobalId(storeyId);
    const index = levels.findIndex((l) => l.storeyGlobalIds.includes(gid));
    if (index >= 0) levelOfStorey.set(storeyId, index);
  }
  return (id) => {
    const storey = storeyOfElement(modelId, id);
    return storey === null ? null : levelOfStorey.get(storey) ?? null;
  };
}

/** A room as every table reads it: the engine's record (`RoomRecord`), and the category Au is split by. */
export interface RoomOfModels extends RoomRecord {
  category: string;
}

/**
 * The rooms of the visible models, the one read behind Au (`collectUrbanAreas`) and the room and area schedule: each
 * room's level (index into `levels`), number (the Name when a LongName names the room), name and area, decided by the
 * engine's rules (`room-areas.ts`: the model's NetFloorArea, else GrossFloorArea, else the footprint of the room's
 * geometry). The spaces that are not rooms are counted in `leftOut`.
 */
export function collectRoomRecords(levels: readonly ProjectLevel[]): { rooms: RoomOfModels[]; leftOut: UrbanAreas['spacesLeftOut'] } {
  const s = useViewerStore.getState();
  const rooms: RoomOfModels[] = [];
  const leftOut = { external: 0, gfa: 0, parents: 0 };
  for (const [modelId, model] of s.models) {
    const store = model.ifcDataStore;
    if (!store?.spatialHierarchy || model.visible === false) continue;
    const offset = model.idOffset ?? 0;
    const view = s.mutationViews.get(modelId) ?? undefined;
    const provider = createListDataProvider(store, model.name, undefined, view);
    const levelOf = levelResolver(modelId, store, levels);
    const scales = scalesOf(store);
    const isSpace = (id: number) => !view?.isDeleted(id) && (store.entities.getTypeName(id) ?? '').toUpperCase() === 'IFCSPACE';
    // The meshes of the spaces, found once and only when a room states no area.
    let meshesOfSpace: Map<number, PlanMesh[]> | null = null;
    const footprintOf = (id: number) => () => {
      if (!meshesOfSpace) {
        meshesOfSpace = new Map();
        for (const mesh of model.geometryResult?.meshes ?? []) (meshesOfSpace.get(mesh.expressId) ?? meshesOfSpace.set(mesh.expressId, []).get(mesh.expressId)!).push(mesh);
      }
      const held = meshesOfSpace.get(id + offset);
      return held?.length ? meshFootprintArea(held) : null;
    };
    for (const { expressId: id } of iterateEffectiveEntityIds(store, view ?? null, ['IFCSPACE'])) {
      const role = spaceRole(enumAttr(store, view, id, 'PredefinedType'), store.relationships?.getRelated(id, RelationshipType.Aggregates, 'forward').some(isSpace) ?? false);
      if (role !== 'room') { leftOut[role === 'external' ? 'external' : role === 'gfa' ? 'gfa' : 'parents']++; continue; }
      const longName = textAttr(store, view, id, 'LongName');
      const name = provider.getEntityName(id);
      const { area, source } = roomArea(provider.getQuantitySets(id), scales.area, footprintOf(id));
      rooms.push({
        id: provider.getEntityGlobalId(id) || `${modelId}#${id}`, number: longName ? name : '', name: longName || name || `#${id}`,
        level: levelOf(id), area, source, category: provider.getEntityObjectType(id) || longName || name || `#${id}`,
      });
    }
  }
  return { rooms, leftOut };
}

/** World-space meshes of a GPU-instanced element, by global id; absent from `geometryResult.meshes`. */
export type InstancedPieces = (globalId: number) => readonly PlanMesh[] | undefined;

const rendererPieces: InstancedPieces = (globalId) => getGlobalRenderer()?.getScene().getInstancedMeshDataPieces(globalId);

/** The last measure and what it was taken from: every table showing the indicators reads this one. */
let measured: { models: unknown; mutationViews: unknown; mutationVersion: number; levels: unknown; instanced: InstancedPieces; areas: UrbanAreas } | null = null;

/**
 * `instanced` resolves the elements drawn by GPU instancing (default: the live
 * renderer's scene). A footprint element (wall, column, curtain wall, non-roof
 * slab) that still has no mesh, or whose outline fails, is counted per level
 * as unmeasured: the level's area is then a lower bound, and says so.
 *
 * Measured once per state: the same models, edit (`mutationVersion`), levels
 * and resolver give back the same result without outlining the meshes again.
 */
export function collectUrbanAreas(instanced: InstancedPieces = rendererPieces): UrbanAreas {
  const s = useViewerStore.getState();
  const levels = useProjectStore.getState().levels;
  const m = measured;
  if (m && m.models === s.models && m.mutationViews === s.mutationViews && m.mutationVersion === s.mutationVersion && m.levels === levels && m.instanced === instanced) return m.areas;
  const areas = measureUrbanAreas(instanced);
  measured = { models: s.models, mutationViews: s.mutationViews, mutationVersion: s.mutationVersion, levels, instanced, areas };
  return areas;
}

function measureUrbanAreas(instanced: InstancedPieces): UrbanAreas {
  const s = useViewerStore.getState();
  const levels = useProjectStore.getState().levels;
  const buckets = levels.map(() => ({ enclosure: [] as PlanMesh[][], floor: [] as PlanMesh[][], slabs: new Set<number>(), missing: 0 }));
  for (const [modelId, model] of s.models) {
    const store = model.ifcDataStore;
    const hierarchy = store?.spatialHierarchy;
    if (!store || !hierarchy || model.visible === false) continue;
    const offset = model.idOffset ?? 0;
    const view = s.mutationViews.get(modelId) ?? undefined;
    const levelOf = levelResolver(modelId, store, levels);
    const flat = new Map<number, PlanMesh[]>();
    for (const mesh of model.geometryResult?.meshes ?? []) {
      const list = flat.get(mesh.expressId);
      if (list) list.push(mesh); else flat.set(mesh.expressId, [mesh]);
    }
    for (const { expressId: id, type } of iterateEffectiveEntityIds(store, view ?? null, [...ENCLOSURE, 'IFCSLAB', 'IFCSPACE'])) {
      const upper = type.toUpperCase();
      const room = upper === 'IFCSPACE';
      if (upper === 'IFCSLAB' && enumAttr(store, view, id, 'PredefinedType') === 'ROOF') continue;
      const level = levelOf(id);
      if (level === null) continue;
      const bucket = buckets[level];
      const meshes = flat.get(id + offset) ?? instanced(id + offset);
      if (!meshes?.length) {
        // A room without a body only helps tell rooms from courtyards; a wall or slab without one is area not measured.
        if (!room) bucket.missing++;
        continue;
      }
      if (ENCLOSURE.has(upper)) bucket.enclosure.push([...meshes]);
      else {
        if (!room) bucket.slabs.add(bucket.floor.length);
        bucket.floor.push([...meshes]);
      }
    }
  }
  const assumedInterior: string[] = [];
  const storeys = levels.map((level, i) => {
    const b = buckets[i];
    const footprint = storeyFootprint(b.enclosure, b.floor);
    if (footprint.assumedInterior) assumedInterior.push(level.name);
    const failed = footprint.unmeasured.enclosure.length + footprint.unmeasured.floor.filter((k) => b.slabs.has(k)).length;
    return { name: level.name, elevation: level.elevation, footprint: footprint.shapes.length ? footprint.shapes : null, unmeasured: b.missing + failed };
  });
  const { rooms, leftOut } = collectRoomRecords(levels);
  const spaces: SpaceInput[] = rooms.map((r) => ({ storey: r.level, category: r.category, area: r.area }));
  return { storeys, spaces, spacesLeftOut: leftOut, modelSiteArea: modelSiteArea(), buildingRefElevation: buildingRefElevation(), assumedInterior };
}
