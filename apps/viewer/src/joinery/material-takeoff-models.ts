/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The loaded models read into the material takeoff's input (#581): the rule is the engine's (`takeoffElementsOf`, the one
 * `ifcsheet build --project` reads with); the app only says which models, with their edit overlay and the live renderer's
 * instanced pieces (`loadedScheduleModels`).
 */

import type { TakeoffElement } from '@bimvoice/ifcsheet';
import { takeoffElementsOf, type ScheduleModel } from '@bimvoice/ifcsheet/project';
import type { ProjectUnits } from '@ifc-lite/parser';
import { loadedScheduleModels } from './schedule-models';

/** SI scales of a model's area and volume units (undeclared: the length unit squared, cubed). */
export function quantityScales(units: ProjectUnits): { length: number; volume: number; area: number } {
  const length = units.unitForMeasure('IfcLengthMeasure')?.siScale ?? 1;
  return {
    length,
    volume: units.resolvedForUnitType('VOLUMEUNIT')?.siScale ?? length ** 3,
    area: units.resolvedForUnitType('AREAUNIT')?.siScale ?? length ** 2,
  };
}

/** The takeoff's elements over `models` (default: the loaded, visible ones). */
export function collectTakeoffElements(models: readonly ScheduleModel[] = loadedScheduleModels()): TakeoffElement[] {
  return takeoffElementsOf(models);
}
