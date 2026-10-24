/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a joinery schedule lists once it is split into sub-reports (#186): the model's rows for its kind,
 * cut by its sub-report filter (`subReportData`, the engine's, so the viewer and the headless chain agree).
 * Every reader of a joinery schedule's content goes through `scheduleDataOf`, never `scheduleData` directly,
 * so a sub-report is the same table on the Wall, on the sheet and when hung.
 */

import { subReportData } from '@bimvoice/ifcsheet';
import type { ProjectSchedule } from '@/project/types';
import { scheduleData, type ScheduleData, type ScheduleKind } from './schedule-data';

/** The content of the joinery schedule `schedule`: its kind's rows, whole, or the part its sub-report keeps. */
export function scheduleDataOf(schedule: Pick<ProjectSchedule, 'kind' | 'sub'>, read: (kind: ScheduleKind) => ScheduleData = scheduleData): ScheduleData {
  return subReportData(read(schedule.kind as ScheduleKind), schedule.sub?.filter);
}
