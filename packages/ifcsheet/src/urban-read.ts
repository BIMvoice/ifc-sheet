/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The models read into `urbanIndicators`' input (#581): one storey per project level (a level spans the models that have it), its
 * footprint from the meshes of what stands on it (`urban-measure.ts`), every room's floor area, and the site area the model states.
 * Reads only `ScheduleModel`, so the app (its loaded models, edit overlay and GPU-instanced pieces) and `ifcsheet build --project`
 * (one opened model) take the same areas from it. The wasm module must be initialised.
 *
 * - Rooms (Au): every IfcSpace except an EXTERNAL one (balcony, terrace), a GFA one (an area-scheme space) and a space that
 *   aggregates spaces of its own (only the leaves are rooms, so nothing is counted twice); those are left out and counted in
 *   `spacesLeftOut`. INTERNAL, NOTDEFINED, unset, SPACE, PARKING and USERDEFINED all count: most tools type an ordinary room SPACE.
 *   The type is the PredefinedType (IFC2X3: InteriorOrExteriorSpace, in the same slot). The area is NetFloorArea, else
 *   GrossFloorArea, from `Qto_SpaceBaseQuantities` first and then any quantity set (ArchiCAD writes them to `BaseQuantities`), in SI
 *   like the material takeoff; when the model states neither, the footprint of the space's geometry. Both rules are `room-areas.ts`,
 *   and `collectRoomRecords` is the one read of the rooms: Au and the room and area schedule both take their rooms from it, so they
 *   cannot differ. The category is the room's ObjectType, else its LongName, else its Name.
 * - Site area: the IfcSite's GrossArea quantity, when positive.
 * - The building's ElevationOfRefHeight, in metres, for finding ±0.00.
 *
 * The attributes read off the source (a space's LongName and PredefinedType, a slab's PredefinedType, the building's reference
 * elevation) are parsed once per model and entity; an edit to them is read from the model's mutation view on top.
 */

import { extractAllEntityAttributes, type IfcDataStore } from '@ifc-lite/parser';
import { RelationshipType } from '@ifc-lite/data';
import { iterateEffectiveEntityIds, type MutablePropertyView } from '@ifc-lite/mutations';
import type { ProjectLevel } from './document.js';
import type { ScheduleModel } from './joinery-schedule.js';
import { createHeadlessListProvider } from './list-provider.js';
import type { ListDataProvider } from '@ifc-lite/lists';
import { boqScales, type BoqScales } from './boq-read.js';
import { meshFootprintArea, meshFootprintPerimeter, pickArea, roomArea, spaceRole } from './room-areas.js';
import { estimatedAreas, type EstimatedAreas } from './room-estimates.js';
import type { RoomRecord } from './room-schedule.js';
import type { PlanMesh } from './urban-footprint.js';
import { measureStoreys, URBAN_FOOTPRINT_CLASSES, type UrbanModelRead } from './urban-measure.js';
import type { SpaceInput, StoreyInput } from './urban-indicators.js';

export interface UrbanAreas {
  storeys: StoreyInput[];
  /** The rooms Au sums. */
  spaces: SpaceInput[];
  /** Spaces that are not rooms: EXTERNAL ones, GFA (area-scheme) ones, and spaces split into spaces of their own. */
  spacesLeftOut: { external: number; gfa: number; parents: number };
  /** The rooms Au counts with an area measured from their geometry because the model states none; null when there are none (`estimatedAreas`). */
  estimated: EstimatedAreas | null;
  /** m² the model states for its site, or null. */
  modelSiteArea: number | null;
  /** The first building's ElevationOfRefHeight in metres, or null. */
  buildingRefElevation: number | null;
  /** Names of the levels whose holes were all taken as inside (walls, no slab or room). */
  assumedInterior: string[];
}

/** The storey (express id) an element of model `modelId` stands on now; the app says it with its edits, the default is the storey the model loaded it on. */
export type StoreyOf = (modelId: string, id: number) => number | null;

/** The list provider of a schedule model: the one it carries, else the headless one over its store. */
const providerOf = (model: ScheduleModel): ListDataProvider => model.listProvider?.() ?? createHeadlessListProvider(model.dataStore, model.name ?? '');

const storeyOnLoad = (models: readonly ScheduleModel[]): StoreyOf => (modelId, id) => models.find((m) => m.modelId === modelId)?.dataStore.spatialHierarchy?.elementToStorey.get(id) ?? null;

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

const scalesByStore = new WeakMap<IfcDataStore, BoqScales>();
/** The SI scales of a model's quantities and lengths, read from its source once (an edit does not change the project's units). */
function scalesOf(store: IfcDataStore): BoqScales {
  let scales = scalesByStore.get(store);
  if (!scales) scalesByStore.set(store, (scales = boqScales(store)));
  return scales;
}

/** The first visible building's ElevationOfRefHeight, metres; null when no model states one. */
function buildingRefElevation(models: readonly ScheduleModel[]): number | null {
  for (const { dataStore: store, view } of models) {
    for (const { expressId: id } of iterateEffectiveEntityIds(store, view, ['IFCBUILDING'])) {
      const edited = view?.getAttributeMutationsForEntity(id).find((m) => m.name === 'ElevationOfRefHeight');
      const v = edited ? edited.value : sourceAttrs(store, id).get('ElevationOfRefHeight');
      if (typeof v === 'number' && Number.isFinite(v)) return v * scalesOf(store).length;
    }
  }
  return null;
}

/** The first positive IfcSite GrossArea among the visible models, m²; null when none states one. */
export function modelSiteArea(models: readonly ScheduleModel[]): number | null {
  for (const model of models) {
    const { dataStore: store, view } = model;
    const provider = providerOf(model);
    const scale = scalesOf(store).area;
    for (const { expressId: id } of iterateEffectiveEntityIds(store, view, ['IFCSITE'])) {
      const area = pickArea(provider.getQuantitySets(id), 'Qto_SiteBaseQuantities', ['GrossArea'], scale);
      if (area !== null && area > 0) return area;
    }
  }
  return null;
}

/** The project level (index into `levels`) of an element of model `modelId`, by its storey; null when it has none. */
function levelResolver(modelId: string, store: IfcDataStore, levels: readonly ProjectLevel[], storeyOf: StoreyOf): (id: number) => number | null {
  const levelOfStorey = new Map<number, number>();
  for (const storeyId of store.spatialHierarchy?.byStorey.keys() ?? []) {
    const gid = store.entities.getGlobalId(storeyId);
    const index = levels.findIndex((l) => l.storeyGlobalIds.includes(gid));
    if (index >= 0) levelOfStorey.set(storeyId, index);
  }
  return (id) => {
    const storey = storeyOf(modelId, id);
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
export function collectRoomRecords(levels: readonly ProjectLevel[], models: readonly ScheduleModel[], storeyOf: StoreyOf = storeyOnLoad(models)): { rooms: RoomOfModels[]; leftOut: UrbanAreas['spacesLeftOut'] } {
  const rooms: RoomOfModels[] = [];
  const leftOut = { external: 0, gfa: 0, parents: 0 };
  for (const model of models) {
    const { modelId, dataStore: store } = model;
    if (!store.spatialHierarchy) continue;
    const view = model.view ?? undefined;
    const provider = providerOf(model);
    const levelOf = levelResolver(modelId, store, levels, storeyOf);
    const scales = scalesOf(store);
    const isSpace = (id: number) => !view?.isDeleted(id) && (store.entities.getTypeName(id) ?? '').toUpperCase() === 'IFCSPACE';
    // The meshes of the spaces: the footprint the perimeter is measured on, and the area when a room states none.
    const meshesOf = (id: number): readonly PlanMesh[] | undefined => model.meshesOf?.(id);
    for (const { expressId: id } of iterateEffectiveEntityIds(store, view ?? null, ['IFCSPACE'])) {
      const role = spaceRole(enumAttr(store, view, id, 'PredefinedType'), store.relationships?.getRelated(id, RelationshipType.Aggregates, 'forward').some(isSpace) ?? false);
      if (role !== 'room') { leftOut[role === 'external' ? 'external' : role === 'gfa' ? 'gfa' : 'parents']++; continue; }
      const longName = textAttr(store, view, id, 'LongName');
      const name = provider.getEntityName(id);
      const held = meshesOf(id);
      const { area, source } = roomArea(provider.getQuantitySets(id), scales.area, held?.length ? () => meshFootprintArea(held) : undefined);
      rooms.push({
        id: provider.getEntityGlobalId(id) || `${modelId}#${id}`, number: longName ? name : '', name: longName || name || `#${id}`,
        level: levelOf(id), area, source, perimeter: held?.length ? meshFootprintPerimeter(held) || null : null, category: provider.getEntityObjectType(id) || longName || name || `#${id}`,
      });
    }
  }
  return { rooms, leftOut };
}

/**
 * The storeys of `levels` with their footprints, the rooms, the site and the building's reference elevation, read from `models`. A
 * footprint element (wall, column, curtain wall, non-roof slab) that still has no mesh, or whose outline fails, is counted per level as
 * unmeasured: the level's area is then a lower bound, and says so. `read` is the rooms when the caller has read them already.
 */
export function collectUrbanAreas(
  levels: readonly ProjectLevel[], models: readonly ScheduleModel[], storeyOf: StoreyOf = storeyOnLoad(models), read = collectRoomRecords(levels, models, storeyOf),
): UrbanAreas {
  // The rule that outlines a level (what stands on it, what counts as unmeasured) is `measureStoreys`; this reads the models for it.
  const reads: UrbanModelRead[] = [];
  for (const { modelId, dataStore: store, view, meshesOf } of models) {
    if (!store.spatialHierarchy) continue;
    const levelOf = levelResolver(modelId, store, levels, storeyOf);
    reads.push({
      ids: iterateEffectiveEntityIds(store, view, [...URBAN_FOOTPRINT_CLASSES]),
      levelOf,
      isRoofSlab: (id) => enumAttr(store, view ?? undefined, id, 'PredefinedType') === 'ROOF',
      meshesOf: (id) => meshesOf?.(id),
    });
  }
  const { storeys, assumedInterior } = measureStoreys(levels, reads);
  const { rooms, leftOut } = read;
  const spaces: SpaceInput[] = rooms.map((r) => ({ storey: r.level, category: r.category, area: r.area }));
  return { storeys, spaces, spacesLeftOut: leftOut, estimated: estimatedAreas(rooms), modelSiteArea: modelSiteArea(models), buildingRefElevation: buildingRefElevation(models), assumedInterior };
}
