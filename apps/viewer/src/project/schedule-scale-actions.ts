/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Writing a schedule's scale (#186); the rule is in `schedule-scale`. */

import { bandFits, isJoinerySchedule, scheduleBox } from './schedule-fit';
import { runAsOneUndoStep } from '@/drafting/draft-store';
import { useProjectStore } from './project-store';
import { scheduleDataOf } from '@/joinery/schedule-split';
import type { ScheduleData } from '@/joinery/schedule-data';

/**
 * Set the scale of the schedule `scheduleId`: its own, and that of every viewport that shows it, in ONE write (so the layout, the
 * pages and the fit follow at once). A viewport whose box cannot hold one band at the new scale goes back to filling the drawing
 * area (the card's "fit"); one that can keeps the box the user gave it. `data` stands in for the model's joinery schedule data.
 */
export function setScheduleScale(scheduleId: string, scale: number, data?: ScheduleData): void {
  const { schedules, sheets } = useProjectStore.getState();
  const schedule = schedules?.find((s) => s.id === scheduleId);
  if (!schedule || !Number.isFinite(scale) || scale <= 0) return;
  const whole = isJoinerySchedule(schedule) ? scheduleDataOf(schedule, data ? () => data : undefined) : undefined;
  const scaled = sheets.map((s) => (!(s.viewports ?? []).some((v) => v.viewId === scheduleId) ? s : {
    ...s,
    viewports: (s.viewports ?? []).map((v) => {
      if (v.viewId !== scheduleId) return v;
      const refit = whole && v.width > 0 && v.height > 0 && !bandFits(whole, scale, scheduleBox(s, v));
      return { ...v, scale, ...(refit ? { width: 0, height: 0 } : {}) };
    }),
  }));
  runAsOneUndoStep(() => useProjectStore.setState({ schedules: (schedules ?? []).map((s) => (s.id === scheduleId ? { ...s, scale } : s)), sheets: scaled, dirty: true }));
}
