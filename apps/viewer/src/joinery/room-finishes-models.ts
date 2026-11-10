/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The loaded models read into the room finishes schedule's input (#581): the rule is the engine's (`roomInputsOf`, the one
 * `ifcsheet build --project` reads with); the app only says which models, with their edit overlay (`loadedScheduleModels`).
 */

import type { RoomInput } from '@bimvoice/ifcsheet';
import { roomInputsOf, type ScheduleModel } from '@bimvoice/ifcsheet/project';
import { loadedScheduleModels } from './schedule-models';

export function collectRoomInputs(models: readonly ScheduleModel[] = loadedScheduleModels()): RoomInput[] {
  return roomInputsOf(models);
}
