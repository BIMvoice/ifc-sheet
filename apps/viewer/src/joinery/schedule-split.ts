/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a joinery schedule lists once it is split into sub-reports (#186): the model's rows for its kind,
 * cut by its sub-report filter (`scheduleOf`, the engine's, so the viewer and the headless chain agree).
 * Every reader of a joinery schedule's content goes through `scheduleDataOf`, never `scheduleData` directly,
 * so a sub-report is the same table on the Wall, on the sheet and when hung.
 */

import { scheduleOf } from '@bimvoice/ifcsheet';
import { useProjectStore } from '@/project/project-store';
import type { ProjectSchedule } from '@/project/types';
import { scheduleData, type ScheduleData, type ScheduleKind } from './schedule-data';

/**
 * The content of the joinery schedule `schedule`: its kind's rows, sorted and numbered by its content choice (its own, or its parent's),
 * whole or the part its sub-report keeps, with the text rows and the row choice it prints, from `schedules` (the project's by default).
 * The assembly is the engine's (`scheduleOf`).
 */
export function scheduleDataOf(
  schedule: Pick<ProjectSchedule, 'kind' | 'sub'> & Partial<Pick<ProjectSchedule, 'id'>>,
  read: (kind: ScheduleKind) => ScheduleData = scheduleData,
  schedules: readonly ProjectSchedule[] = useProjectStore.getState().schedules ?? [],
): ScheduleData {
  return scheduleOf(schedules, { id: schedule.id ?? '', sub: schedule.sub }, read(schedule.kind as ScheduleKind));
}
