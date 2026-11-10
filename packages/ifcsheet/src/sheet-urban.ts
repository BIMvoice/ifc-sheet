/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the urban indicators schedule and the room and area schedule on a sheet read of an opened model (#581): the levels its storeys
 * merge into (`levelsFromStoreys`, the app's level list), the rooms (`collectRoomRecords`, the one read behind Au and the room
 * schedule) and the footprints of what stands on each level, measured once and shared by both schedules. The app reads the same from
 * its loaded models (`urban-models.ts`, `room-schedule-hooks.ts`). The wasm 2D booleans must be initialised.
 */

import type { ProjectLevel } from './document.js';
import type { OpenedModel } from './model.js';
import { scheduleModelsOf } from './schedule-models.js';
import { siteAreaOf, type SiteAreaChoice, type SiteAreaProject } from './site-area.js';
import { levelsFromStoreys } from './view-defaults.js';
import { collectRoomRecords, collectUrbanAreas, type RoomOfModels, type UrbanAreas } from './urban-read.js';
import { urbanIndicators, type UrbanIndicators, type UrbanSettings } from './urban-indicators.js';

export interface SheetUrban {
  levels: ProjectLevel[];
  rooms: RoomOfModels[];
  /** The spaces that are not rooms, counted by why. */
  leftOut: UrbanAreas['spacesLeftOut'];
  areas: UrbanAreas;
}

/** The levels, rooms and footprints of `model`; `name` is the model's name, as a list labels it. */
export function sheetUrbanOf(model: Pick<OpenedModel, 'dataStore' | 'meshes' | 'storeys'>, name: string): SheetUrban {
  const levels = levelsFromStoreys(model.storeys);
  const models = scheduleModelsOf(model, name);
  const read = collectRoomRecords(levels, models);
  return { levels, ...read, areas: collectUrbanAreas(levels, models, undefined, read) };
}

/** What the indicators read of the project besides the measured areas. */
export type UrbanProject = SiteAreaProject & { urbanSettings?: UrbanSettings };

/** The indicators of `areas` on the site area `siteAreaOf` picks and the project's urban settings; `site` says which it took. The app and the build share it. */
export function urbanResultOf(areas: UrbanAreas, project: UrbanProject): { areas: UrbanAreas; result: UrbanIndicators; site: SiteAreaChoice } {
  const site = siteAreaOf({ siteArea: project.siteArea, views: project.views, drafts: project.drafts }, areas.modelSiteArea);
  return { areas, result: urbanIndicators({ ...areas, siteArea: site.area, ...(project.urbanSettings ? { settings: project.urbanSettings } : {}) }), site };
}
