/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the room and area schedule on a sheet reads of a model (#479): the rooms (`readRooms`, the rule the app's collector follows),
 * set on the levels the storeys merge into (`levelsFromStoreys`, the app's level list), and the area summary under the table, from
 * the footprints the urban indicators measure (`measuredStoreysOf`). The app reads the same rooms and the same footprints from its
 * loaded models (`room-schedule-hooks.ts`).
 */

import { readRooms } from './room-read.js';
import { roomSchedule } from './room-schedule.js';
import { measuredStoreysOf } from './rural-scope-read.js';
import { buildingRefElevationOf } from './urban-measure.js';
import { areaSummary, type AreaSummary } from './urban-area-summary.js';
import { urbanIndicators, type UrbanSettings } from './urban-indicators.js';
import type { RoomScheduleData } from './sheet-words.js';
import type { OpenedModel } from './model.js';

/** The room schedule of `model` and its area summary; `data` is null when the model has no room. */
export function sheetRoomsOf(model: OpenedModel, settings?: UrbanSettings): { data: RoomScheduleData | null; summary: AreaSummary | null } {
  const read = readRooms(model.dataStore, model.meshes);
  if (read.rooms.length === 0) return { data: null, summary: null };
  const { levels, levelOfStorey, storeys } = measuredStoreysOf(model);
  // `readRooms` numbers the levels by storey, in the order of the hierarchy; the schedule's levels are the merged ones.
  const storeyIds = [...(model.dataStore.spatialHierarchy?.byStorey.keys() ?? [])];
  const rooms = read.rooms.map((r) => ({ ...r, level: r.level === null ? null : levelOfStorey.get(storeyIds[r.level]) ?? null }));
  const spaces = rooms.map((r) => ({ storey: r.level, category: '', area: r.area }));
  const result = urbanIndicators({ storeys, spaces, siteArea: null, buildingRefElevation: buildingRefElevationOf(model.dataStore), ...(settings ? { settings } : {}) });
  return { data: { schedule: roomSchedule(levels, rooms), leftOut: read.leftOut }, summary: areaSummary(result) };
}
