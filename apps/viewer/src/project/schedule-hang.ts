/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Hanging the parts of a split schedule (#186): each on a sheet of its own (`hangSchedule`), or side by side on as few sheets as they
 * fit (`planSideBySide`). All of it is one undo step.
 */

import { runAsOneUndoStep } from '@/drafting/draft-store';
import type { ScheduleData } from '@/joinery/schedule-data';
import { scheduleDataOf } from '@/joinery/schedule-split';
import { bareScheduleSheet, hangSchedule } from './drawing-set-actions';
import { useProjectStore } from './project-store';
import { isJoinerySchedule } from './schedule-fit';
import { PART_GAP, planSideBySide } from './schedule-side-by-side';
import { freshProjectId } from './view-defaults';
import { sheetDrawingArea } from './viewport-resize';
import type { ProjectSchedule } from './types';

export interface HangPartsOptions {
  /** Put the parts that fit next to each other on one sheet and continue on the next, instead of one sheet each. */
  sideBySide?: boolean;
  /** Stands in for the model's joinery schedule data (`hangSchedule`). */
  data?: ScheduleData;
}

/** Hang the schedules `ids` in order; returns the ids of the sheets they went on, in order. A schedule already on a sheet stays where it is. */
export function hangScheduleParts(ids: readonly string[], options: HangPartsOptions = {}): string[] {
  const out: string[] = [];
  runAsOneUndoStep(() => {
    const hung = (id: string) => useProjectStore.getState().sheets.some((s) => (s.viewports ?? []).some((v) => v.viewId === id));
    const schedules = ids.flatMap((id) => useProjectStore.getState().schedules?.find((s) => s.id === id) ?? []);
    const alone = (id: string) => { const sheet = hangSchedule(id, options.data); if (sheet) out.push(sheet); };
    if (!options.sideBySide) { for (const s of schedules) alone(s.id); return; }
    const area = sheetDrawingArea(bareScheduleSheet(''));
    const dataOf = (s: ProjectSchedule) => (isJoinerySchedule(s) ? scheduleDataOf(s, options.data ? () => options.data! : undefined) : undefined);
    // A part already hung is not moved: it ends the run before it, like a part that does not fit beside another.
    const plans = planSideBySide(schedules.map((s) => ({ id: s.id, data: hung(s.id) ? undefined : dataOf(s), scale: s.scale ?? 50 })), area);
    for (const plan of plans) {
      if (plan.length === 1) { alone(plan[0].id); continue; }
      const names = plan.map((p) => schedules.find((s) => s.id === p.id)?.name ?? '');
      const sheet = { ...bareScheduleSheet(names.join(' + ')) };
      let left = area.x;
      sheet.viewports = plan.map((p) => {
        const vp = { id: freshProjectId('viewport'), viewId: p.id, x: left + p.width / 2, y: area.y + area.h / 2, scale: schedules.find((s) => s.id === p.id)?.scale ?? 50, width: p.width, height: area.h, center: null };
        left += p.width + PART_GAP;
        return vp;
      });
      useProjectStore.setState({ sheets: [...useProjectStore.getState().sheets, sheet], dirty: true });
      out.push(sheet.id);
    }
  });
  return out;
}
