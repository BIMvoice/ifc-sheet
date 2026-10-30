/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A joinery schedule laid out on paper. The layout is the engine's (`joinery-schedule-layout.ts`, #581): the screen tab, the sheets, SVG
 * and DXF here, and the PDF of `ifcsheet build --project`, draw the same primitives. This file only says what the app adds: the opening-line
 * convention of the open project, read from its store when the caller gives none.
 */

import type { ScheduleCell, ScheduleLayout, SchedulePrim } from '@bimvoice/ifcsheet';
import { joineryScheduleLayout, type ScheduleLabels, type ScheduleLayoutOptions } from '@bimvoice/ifcsheet/project';
import type { ScheduleData } from './schedule-data';
import { openingConvention } from './opening-convention';

export {
  cellTextOf, joineryExport, operationText, scheduleMinBox, schedulePages,
  type JoineryExportLabels, type ScheduleLabels, type ScheduleLayoutOptions,
} from '@bimvoice/ifcsheet/project';
export type { ScheduleCell, ScheduleLayout, SchedulePrim };

export function layoutSchedule(data: ScheduleData, labels: ScheduleLabels, options: ScheduleLayoutOptions = {}): ScheduleLayout {
  return joineryScheduleLayout(data, labels, { convention: openingConvention(), ...options });
}
