/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Duplicates and gaps across the schedules that are split into sub-reports (#186), as the app reads them from the
 * project: the rule is the engine's (`checkSubReports`, `@bimvoice/ifcsheet`); this only gathers the inputs, the
 * parent's rows and its parts, and names an element the way the app marks it (`occurrenceMark`). The "What the model
 * lacks" list (`ReadinessList`) and the cards on the Wall both read through here.
 */

import { checkSubReports, type SubReportCheck } from '@bimvoice/ifcsheet';
import { occurrenceMark, scheduleData, type ScheduleData, type ScheduleKind } from '@/joinery/schedule-data';
import { canSplit, subReportsOf } from '@/joinery/schedules';
import type { ProjectSchedule } from '@/project/types';

/** The check of one split schedule: its rows (as `read` gives them) against its parts. Parts read their parent's whole rows, never a part of a part. */
export function subReportCheckOf(parent: ProjectSchedule, schedules: readonly ProjectSchedule[], read: (kind: ScheduleKind) => ScheduleData = scheduleData): SubReportCheck {
  const parts = subReportsOf(schedules, parent.id).map((p) => ({ id: p.id, name: p.name, filter: p.sub!.filter }));
  return checkSubReports({ id: parent.id, name: parent.name, data: parts.length > 0 ? read(parent.kind as ScheduleKind) : { entries: [], levels: [] } }, parts, occurrenceMark);
}

/** The checks of every schedule that has parts, in the order of the schedules. */
export function subReportChecks(schedules: readonly ProjectSchedule[], read?: (kind: ScheduleKind) => ScheduleData): SubReportCheck[] {
  return schedules.filter((s) => canSplit(s) && subReportsOf(schedules, s.id).length > 0).map((s) => subReportCheckOf(s, schedules, read));
}
