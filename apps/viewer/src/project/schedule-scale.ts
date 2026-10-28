/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The scale of a schedule on the sheets (#186). A schedule has ONE scale, `ProjectSchedule.scale` (1:50 when absent): the layout, the
 * paging, the fit and the split offer all read it. The viewports that show the schedule carry a copy (their `scale`, which the
 * card's field displays), kept equal to it: `setScheduleScale` (`schedule-scale-actions`) writes both, and `withScheduleScale` puts a
 * drifted copy back.
 */

import type { ProjectSchedule, ProjectSheet } from './types';

/** The scale `schedule` is laid out at. */
export const scheduleScaleOf = (schedule: Pick<ProjectSchedule, 'scale'>): number => schedule.scale ?? 50;

/** `sheets` with every viewport of `scheduleId` at `scale`; a sheet where none differs is the same object. */
export function withScheduleScale(sheets: readonly ProjectSheet[], scheduleId: string, scale: number): ProjectSheet[] {
  const drifted = (s: ProjectSheet) => (s.viewports ?? []).some((v) => v.viewId === scheduleId && v.scale !== scale);
  return sheets.map((s) => (drifted(s) ? { ...s, viewports: (s.viewports ?? []).map((v) => (v.viewId === scheduleId ? { ...v, scale } : v)) } : s));
}
