/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Schedules built from the Lists engine (#78) as project edits: create one and hang it on a sheet, change its definition. */

import type { ListScheduleColumn, ListScheduleDef } from '@bimvoice/ifcsheet';
import { hangSchedule } from '@/project/drawing-set-actions';
import { runAsOneUndoStep } from '@/drafting/draft-store';
import { addSchedule, scheduleById, updateSchedule } from './schedules';

/** A new schedule named `name` with the definition `list`, hung on a sheet of its own (`hangSchedule`); returns the sheet's id. One undo step. */
export function addListScheduleToSet(name: string, list: ListScheduleDef): string {
  let sheet: string | null = null;
  runAsOneUndoStep(() => {
    const id = addSchedule('list', name);
    updateSchedule(id, { list });
    sheet = hangSchedule(id);
  });
  if (!sheet) throw new Error('a schedule just added was not found');
  return sheet;
}

/** Replace the definition of the list schedule `id` (and rename it when `name` is given). */
export function setListSchedule(id: string, list: ListScheduleDef, name?: string): void {
  if (scheduleById(id)?.kind !== 'list') return;
  updateSchedule(id, { list, ...(name ? { name } : {}) });
}

/** The column without its `hidden` mark. */
function shown({ hidden: _hidden, ...column }: ListScheduleColumn): ListScheduleColumn {
  return column;
}

/** Show or hide one column of the list schedule `id` on the sheet. */
export function setListColumnHidden(id: string, columnId: string, hidden: boolean): void {
  const list = scheduleById(id)?.list;
  if (!list) return;
  setListSchedule(id, { ...list, columns: list.columns.map((c) => (c.id !== columnId ? c : hidden ? { ...c, hidden: true as const } : shown(c))) });
}

/** Move a column of the list schedule `id` one place up (`-1`) or down (`1`). */
export function moveListColumn(id: string, columnId: string, by: -1 | 1): void {
  const list = scheduleById(id)?.list;
  const from = list?.columns.findIndex((c) => c.id === columnId) ?? -1;
  const to = from + by;
  if (!list || from < 0 || to < 0 || to >= list.columns.length) return;
  const columns = [...list.columns];
  [columns[from], columns[to]] = [columns[to], columns[from]];
  setListSchedule(id, { ...list, columns });
}

/** Show or hide the totals row. */
export function setListTotals(id: string, on: boolean): void {
  const list = scheduleById(id)?.list;
  if (!list) return;
  const rest: ListScheduleDef = { ...list };
  delete rest.totals;
  setListSchedule(id, on ? rest : { ...rest, totals: false });
}
