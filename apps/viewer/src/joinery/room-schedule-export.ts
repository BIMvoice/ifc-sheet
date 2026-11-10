/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The room and area schedule for the one CSV and XLSX writer (`schedule-export.ts`, #80): the engine's table of the rooms (the
 * rows the sheet and the command line print, areas and perimeters as numbers) and, when the footprints are measured, the area
 * summary as a second worksheet, so the file holds what the sheet shows.
 */

import { roomScheduleTable, type RoomSchedule } from '@bimvoice/ifcsheet';
import type { ScheduleExport } from './schedule-export';
import { summaryTable } from '@bimvoice/ifcsheet';
import type { RoomScheduleLabels } from '@bimvoice/ifcsheet';

export function roomScheduleExport(schedule: RoomSchedule, labels: RoomScheduleLabels): ScheduleExport {
  return { title: labels.title, tables: [roomScheduleTable(schedule, labels, labels.notes), ...(labels.summary ? [summaryTable(labels.summary)] : [])] };
}
