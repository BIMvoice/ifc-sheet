/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the room and area schedule on a sheet reads of a model (#479, #581): the rooms (`collectRoomRecords`, the one read the app and
 * the urban indicators take their rooms from), set on the levels the storeys merge into (`levelsFromStoreys`, the app's level list),
 * and the area summary under the table, from the footprints the urban indicators measure. All of it comes from one `SheetUrban`, so
 * the rooms schedule and the urban schedule on a sheet measure the footprints once. The app reads the same from its loaded models
 * (`room-schedule-hooks.ts`).
 */

import { roomSchedule } from './room-schedule.js';
import type { SheetUrban } from './sheet-urban.js';
import { areaSummary, type AreaSummary } from './urban-area-summary.js';
import { urbanIndicators, type UrbanSettings } from './urban-indicators.js';
import type { RoomScheduleData } from './sheet-words.js';

/** The room schedule of `read` and its area summary; `data` is null when the model has no room. */
export function sheetRoomsOf(read: SheetUrban, settings?: UrbanSettings): { data: RoomScheduleData | null; summary: AreaSummary | null } {
  if (read.rooms.length === 0) return { data: null, summary: null };
  const { areas } = read;
  const result = urbanIndicators({ storeys: areas.storeys, spaces: areas.spaces, siteArea: null, buildingRefElevation: areas.buildingRefElevation, ...(settings ? { settings } : {}) });
  return { data: { schedule: roomSchedule(read.levels, read.rooms), leftOut: read.leftOut }, summary: areaSummary(result) };
}
