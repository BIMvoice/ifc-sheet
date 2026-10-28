/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Schedules built from the Lists engine (#78) as project edits: create one and hang it on a sheet, change its definition. */

import { clearListOverride, listColumnKey, setListOverride, type ListScheduleColumn, type ListScheduleDef } from '@bimvoice/ifcsheet';
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

/**
 * Replace the definition of the list schedule `id` (and rename it when `name` is given). The cell overrides (#446) stay with the schedule
 * when `list` carries none of its own, as the builder's does not: editing the columns or the filter never throws away what was typed.
 */
export function setListSchedule(id: string, list: ListScheduleDef, name?: string): void {
  const held = scheduleById(id);
  if (held?.kind !== 'list') return;
  const overrides = list.overrides ?? held.list?.overrides;
  updateSchedule(id, { list: { ...list, ...(overrides ? { overrides } : {}) }, ...(name ? { name } : {}) });
}

/** Add a column to the list schedule `id` on the sheet, the same choice the builder offers; a property already there is not added twice. One undo step. */
export function addListColumn(id: string, column: ListScheduleColumn): void {
  const list = scheduleById(id)?.list;
  if (!list || list.columns.some((c) => c.id === column.id || listColumnKey(c) === listColumnKey(column))) return;
  runAsOneUndoStep(() => setListSchedule(id, { ...list, columns: [...list.columns, column] }));
}

/** Take a column off the list schedule `id`, and out of its grouping and sums. Its cell overrides stay saved, so the column added again shows them. One undo step. */
export function removeListColumn(id: string, columnId: string): void {
  const list = scheduleById(id)?.list;
  if (!list?.columns.some((c) => c.id === columnId)) return;
  const groupBy = (list.groupBy ?? []).filter((g) => g !== columnId), sum = (list.sum ?? []).filter((g) => g !== columnId);
  const { groupBy: _g, sum: _s, ...rest } = list;
  runAsOneUndoStep(() => setListSchedule(id, { ...rest, columns: list.columns.filter((c) => c.id !== columnId), ...(groupBy.length ? { groupBy } : {}), ...(groupBy.length && sum.length ? { sum } : {}) }));
}

/** The cell of the element `guid` in the column `columnId` of the list schedule `id` prints `value` (`about`: what the element is called). One undo step. */
export function setListCellOverride(id: string, guid: string, columnId: string, value: string, about: string): void {
  const list = scheduleById(id)?.list, column = list?.columns.find((c) => c.id === columnId);
  if (!list || !column) return;
  runAsOneUndoStep(() => updateSchedule(id, { list: { ...list, overrides: setListOverride(list.overrides, guid, listColumnKey(column), value, about) } }));
}

/** The cell prints the model's value again ("Reset to model value"). One undo step. */
export function resetListCellOverride(id: string, guid: string, columnId: string): void {
  const list = scheduleById(id)?.list, column = list?.columns.find((c) => c.id === columnId);
  if (!list || !column) return;
  const overrides = clearListOverride(list.overrides, guid, listColumnKey(column));
  const { overrides: _old, ...rest } = list;
  runAsOneUndoStep(() => updateSchedule(id, { list: overrides.length ? { ...rest, overrides } : rest }));
}

/** Drop every override of the elements `guids` (the ones no longer in the model) from the list schedule `id`. One undo step. */
export function dropListOverridesOf(id: string, guids: readonly string[]): void {
  const list = scheduleById(id)?.list;
  if (!list?.overrides) return;
  const gone = new Set(guids);
  const overrides = list.overrides.filter((o) => !gone.has(o.guid));
  const { overrides: _old, ...rest } = list;
  runAsOneUndoStep(() => updateSchedule(id, { list: overrides.length ? { ...rest, overrides } : rest }));
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
