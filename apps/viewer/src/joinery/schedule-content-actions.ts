/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Editing the content choice of a joinery schedule (#186, section 3). The choice lives on the schedule that owns it: the schedule
 * itself, or, for a sub-report, the one it was cut from (`contentOf`), so a part is edited where its parent is. The rules are the
 * engine's (`schedule-content.ts`); these write the result to the project.
 *
 * A change of numbering reaches the plan tags: a plan tag reads the element's Tag, which holds the schedule's mark once the numbers
 * were written (`schedule-numbering.ts`). When the marks change, the Tag of an element that carried its old mark gets the new one,
 * in one undo step per model. A Tag nobody wrote from the schedule is not touched.
 */

import { applyContent, followedTags, orderedRows, readScheduleContent, textOwner, type ScheduleContent, type ScheduleNumbering, type ScheduleSort, type SubReportFilter } from '@bimvoice/ifcsheet';
import { useProjectStore } from '@/project/project-store';
import { isJoinerySchedule } from '@/project/schedule-fit';
import type { ProjectSchedule } from '@/project/types';
import { scheduleData, type ScheduleKind } from './schedule-data';
import { writeTags } from './schedule-numbering';
import { updateSchedule } from './schedules';

/** The schedule whose choice `scheduleId` prints; undefined for one that is not a joinery list. */
export function contentHolder(scheduleId: string): ProjectSchedule | undefined {
  const schedules = useProjectStore.getState().schedules ?? [];
  const schedule = schedules.find((s) => s.id === scheduleId);
  return schedule && isJoinerySchedule(schedule) ? textOwner(schedules, schedule) : undefined;
}

/** The ids of the text rows of `holder`, in order. */
const textIds = (holder: ProjectSchedule): string[] => (holder.textRows ?? []).map((r) => r.id);

/** Replace the choice of the holder of `scheduleId` with `change`'s result (an empty choice is no choice), and move the plan tags with the marks. */
export function changeContent(scheduleId: string, change: (content: ScheduleContent) => ScheduleContent): { written: number; errors: string[] } {
  const none = { written: 0, errors: [] };
  const holder = contentHolder(scheduleId);
  if (!holder) return none;
  const before = holder.content;
  const after = readScheduleContent(change(structuredClone(before ?? {})));
  updateSchedule(holder.id, { content: after });
  const whole = scheduleData(holder.kind as ScheduleKind);
  const writes = followedTags(applyContent(whole, before), applyContent(whole, after));
  return writes.length > 0 ? writeTags(writes) : none;
}

/** Show or hide a row (`rowId` as the engine names it: `name`, `levels`, `text:<id>`). */
export function setRowShown(scheduleId: string, rowId: string, shown: boolean): void {
  changeContent(scheduleId, (c) => {
    const hidden = new Set(c.rows?.hidden ?? []);
    if (shown) hidden.delete(rowId); else hidden.add(rowId);
    return { ...c, rows: { ...c.rows, hidden: [...hidden] } };
  });
}

/** Move a row one place up (`-1`) or down (`1`) among all the rows, hidden ones included. */
export function moveRow(scheduleId: string, rowId: string, by: -1 | 1): void {
  const holder = contentHolder(scheduleId);
  if (!holder) return;
  const ids = orderedRows(holder.content, textIds(holder)).map((r) => r.id);
  const at = ids.indexOf(rowId), to = at + by;
  if (at < 0 || to < 0 || to >= ids.length) return;
  [ids[at], ids[to]] = [ids[to], ids[at]];
  changeContent(scheduleId, (c) => ({ ...c, rows: { ...c.rows, order: ids } }));
}

/** Sort the type columns; `undefined` is the order the model gives. Marks that follow the order (`sequence`) move the tags with it. */
export function setSort(scheduleId: string, sort: ScheduleSort | undefined): { written: number; errors: string[] } {
  return changeContent(scheduleId, ({ sort: _old, ...c }) => (sort ? { ...c, sort } : c));
}

/** Change the numbering; a field set to `undefined` goes back to its default. Returns what happened to the tags of the elements the schedule had numbered. */
export function setNumbering(scheduleId: string, patch: { [K in keyof ScheduleNumbering]: ScheduleNumbering[K] | undefined }): { written: number; errors: string[] } {
  return changeContent(scheduleId, (c) => {
    const numbering: ScheduleNumbering = { ...c.numbering };
    for (const [key, value] of Object.entries(patch) as [keyof ScheduleNumbering, never][]) {
      if (value === undefined) delete numbering[key]; else numbering[key] = value;
    }
    return { ...c, numbering };
  });
}

/** Show or hide the elevation or the plan in the header cell of every type. Both show unless turned off, so showing removes the mark from the content. */
export function setSymbolShown(scheduleId: string, symbol: 'elevation' | 'plan', shown: boolean): void {
  changeContent(scheduleId, (c) => {
    const symbols = { ...c.symbols };
    if (shown) delete symbols[symbol]; else symbols[symbol] = false;
    return { ...c, symbols };
  });
}

/** Change what the whole schedule keeps; a dimension set to `undefined` is no longer restricted. The marks move with the scope, and so do the tags of elements numbered by them. */
export function setScheduleFilter(scheduleId: string, patch: { [K in keyof SubReportFilter]?: SubReportFilter[K] | undefined }): { written: number; errors: string[] } {
  return changeContent(scheduleId, (c) => {
    const filter: SubReportFilter = { ...c.filter, ...patch };
    for (const key of Object.keys(filter) as (keyof SubReportFilter)[]) if (filter[key] === undefined) delete filter[key];
    return { ...c, filter };
  });
}

/** Back to the schedule as it was: every row, the model's order, the catalogue's marks. */
export function resetContent(scheduleId: string): void {
  changeContent(scheduleId, () => ({}));
}
