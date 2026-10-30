/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The loaded models read into `urbanIndicators`' input (#581): the rule is the engine's (`collectUrbanAreas`, `collectRoomRecords` and
 * `modelSiteArea`, the ones `ifcsheet build --project` reads with); the app only says which models, with their edit overlay and the live
 * renderer's instanced pieces (`loadedScheduleModels`), which levels the project holds and which storey an element stands on now
 * (`storeyOfElement`, after a move). Reads the stores; the wasm module must be initialised.
 */

import { useViewerStore } from '@/store';
import { useProjectStore } from '@/project/project-store';
import { storeyOfElement } from '@/project/effective-storey';
import { loadedScheduleModels } from '@/joinery/schedule-models';
import { collectRoomRecords as roomRecordsOf, collectUrbanAreas as urbanAreasOf, modelSiteArea as siteAreaOfModels, type RoomOfModels, type UrbanAreas } from '@bimvoice/ifcsheet/urban';
import { pickArea } from '@bimvoice/ifcsheet';
import type { InstancedMeshes } from '@/joinery/element-meshes';
import type { ProjectLevel } from '@/project/types';

export type { RoomOfModels, UrbanAreas };

/** The engine's: the first of `names` found, preferring the set named `preferred`; in SI. */
export { pickArea };

/** The first positive IfcSite GrossArea among the visible models, m²; null when none states one. */
export function modelSiteArea(models = loadedScheduleModels()): number | null {
  return siteAreaOfModels(models);
}

/** The rooms of the visible models, the one read behind Au (`collectUrbanAreas`) and the room and area schedule (the engine's `collectRoomRecords`). */
export function collectRoomRecords(levels: readonly ProjectLevel[], models = loadedScheduleModels()): { rooms: RoomOfModels[]; leftOut: UrbanAreas['spacesLeftOut'] } {
  return roomRecordsOf(levels, models, storeyOfElement);
}

/** World-space meshes of a GPU-instanced element, by global id; absent from `geometryResult.meshes`. */
export type InstancedPieces = InstancedMeshes;

/** The last measure and what it was taken from: every table showing the indicators reads this one. */
let measured: { models: unknown; mutationViews: unknown; mutationVersion: number; levels: unknown; instanced: InstancedPieces | null; areas: UrbanAreas } | null = null;

/**
 * `instanced` resolves the elements drawn by GPU instancing (default: the live
 * renderer's scene). A footprint element (wall, column, curtain wall, non-roof
 * slab) that still has no mesh, or whose outline fails, is counted per level
 * as unmeasured: the level's area is then a lower bound, and says so.
 *
 * Measured once per state: the same models, edit (`mutationVersion`), levels
 * and resolver give back the same result without outlining the meshes again.
 */
export function collectUrbanAreas(instanced?: InstancedPieces): UrbanAreas {
  const s = useViewerStore.getState();
  const levels = useProjectStore.getState().levels;
  const m = measured;
  if (m && m.models === s.models && m.mutationViews === s.mutationViews && m.mutationVersion === s.mutationVersion && m.levels === levels && m.instanced === (instanced ?? null)) return m.areas;
  const areas = measureUrbanAreas(instanced);
  measured = { models: s.models, mutationViews: s.mutationViews, mutationVersion: s.mutationVersion, levels, instanced: instanced ?? null, areas };
  return areas;
}

function measureUrbanAreas(instanced: InstancedPieces | undefined): UrbanAreas {
  return urbanAreasOf(useProjectStore.getState().levels, loadedScheduleModels({ instanced }), storeyOfElement);
}
