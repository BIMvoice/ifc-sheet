/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Editing the text rows of a joinery schedule (#186, section 4). The rows live on the schedule that owns the text: the schedule
 * itself, or, for a sub-report, the one it was cut from (`textOwner`), so a part is edited where its parent is and every part
 * shows the cells of its own types. The edits are the engine's pure functions; these write the result to the project.
 */

import { addTextRow, removeTextRow, renameTextRow, setTextCell, textOwner, type ScheduleTextRow } from '@bimvoice/ifcsheet';
import { useProjectStore } from '@/project/project-store';
import { freshProjectId } from '@/project/view-defaults';
import { isJoinerySchedule } from '@/project/schedule-fit';
import { updateSchedule } from './schedules';

/** Apply `edit` to the text rows of the schedule that owns `scheduleId`'s text; an emptied list is no list. No-op for a schedule that is not a joinery list. */
function edit(scheduleId: string, change: (rows: readonly ScheduleTextRow[]) => ScheduleTextRow[]): boolean {
  const schedules = useProjectStore.getState().schedules ?? [];
  const schedule = schedules.find((s) => s.id === scheduleId);
  const owner = schedule && isJoinerySchedule(schedule) ? textOwner(schedules, schedule) : undefined;
  if (!owner) return false;
  const rows = change(owner.textRows ?? []);
  updateSchedule(owner.id, { textRows: rows.length ? rows : undefined });
  return true;
}

/** A new empty row named `label`; returns its id, or null when the schedule cannot take one (not a joinery list, or full). */
export function addScheduleTextRow(scheduleId: string, label: string): string | null {
  const id = freshProjectId('textrow');
  let added = false;
  edit(scheduleId, (rows) => { const next = addTextRow(rows, id, label); added = next.length > rows.length; return next; });
  return added ? id : null;
}

export function renameScheduleTextRow(scheduleId: string, rowId: string, label: string): void {
  edit(scheduleId, (rows) => renameTextRow(rows, rowId, label));
}

/** The row and all its text. */
export function removeScheduleTextRow(scheduleId: string, rowId: string): void {
  edit(scheduleId, (rows) => removeTextRow(rows, rowId));
}

/** `text` into the cell of the type `key` (`about` describes it, for when it is gone); empty text clears the cell. */
export function setScheduleTextCell(scheduleId: string, rowId: string, key: string, text: string, about: string): void {
  edit(scheduleId, (rows) => setTextCell(rows, rowId, key, text, about));
}

/** The cell of `key` removed: how an orphan is dismissed. */
export function removeScheduleTextCell(scheduleId: string, rowId: string, key: string): void {
  setScheduleTextCell(scheduleId, rowId, key, '', '');
}
