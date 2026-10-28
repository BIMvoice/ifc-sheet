/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Undo and redo of the editing tools (#165). A drawing set's `set` is replaced
 * by every edit and never mutated in place, so a snapshot is the old `set`
 * reference plus a copy of the schedules list. `recordEdit` runs inside
 * `replaceSheetDocument`, before the edit lands, so every edit is covered and
 * no tool can forget it. A dry run works on a copy of the entry with its own
 * empty history (`workingEntry`), so it records nothing in the session's.
 */

import type { DefaultSet } from '@bimvoice/ifcsheet';
import type { SetSchedule } from './ifcsheet-store.js';

/** Edits kept per drawing set; the oldest is dropped first. */
export const MAX_HISTORY = 50;

export interface SetSnapshot {
  set: DefaultSet;
  schedules: SetSchedule[];
}

export interface SetHistory {
  undo: SetSnapshot[];
  redo: SetSnapshot[];
}

interface Editable {
  set: DefaultSet;
  schedules: SetSchedule[];
  history: SetHistory;
}

export const newHistory = (): SetHistory => ({ undo: [], redo: [] });

const snapshotOf = (entry: Editable): SetSnapshot => ({ set: entry.set, schedules: [...entry.schedules] });

function restore(entry: Editable, snap: SetSnapshot): void {
  entry.set = snap.set;
  entry.schedules = [...snap.schedules];
}

/** Keeps the state before an edit and forgets the redo stack (a new edit ends the undone branch). */
export function recordEdit(entry: Editable): void {
  entry.history.undo.push(snapshotOf(entry));
  while (entry.history.undo.length > MAX_HISTORY) entry.history.undo.shift();
  entry.history.redo.length = 0;
}

/** Puts back the state before the last edit. False when there is nothing to undo. */
export function undoEdit(entry: Editable): boolean {
  const snap = entry.history.undo.pop();
  if (!snap) return false;
  entry.history.redo.push(snapshotOf(entry));
  restore(entry, snap);
  return true;
}

/** Re-applies the last undone edit. False when there is nothing to redo. */
export function redoEdit(entry: Editable): boolean {
  const snap = entry.history.redo.pop();
  if (!snap) return false;
  entry.history.undo.push(snapshotOf(entry));
  restore(entry, snap);
  return true;
}
