/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The issue panel's offer: one new revision on the sheets that changed without one (#331). */

import { runAsOneUndoStep } from '@/drafting/draft-store';
import { addRevision } from '@/project/revision-actions';
import { addSheetRevision } from '@/project/sheets';

/**
 * Add one new revision, dated `date`, to each of `sheetIds`: the record and every sheet's choice of it are
 * one undo step. Returns the revision's id, or null (and changes nothing) when there are no sheets.
 */
export function addRevisionToSheets(sheetIds: readonly string[], date: string): string | null {
  if (sheetIds.length === 0) return null;
  let id: string | null = null;
  runAsOneUndoStep(() => {
    id = addRevision({ date });
    for (const sheetId of sheetIds) addSheetRevision(sheetId, id);
  });
  return id;
}
