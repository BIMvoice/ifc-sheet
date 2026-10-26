/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** `ifcsheet_undo` and `ifcsheet_redo` (#165): walk the history of the editing tools on one drawing set. */

import { MAX_HISTORY, redoEdit, undoEdit } from './ifcsheet-history.js';
import { DOCUMENT_ID, sheetsOf, text } from './ifcsheet-shared.js';
import { getSheetSet } from './ifcsheet-store.js';
import type { Tool } from './types.js';
import { okResult } from './util.js';

const KEPT = `The last ${MAX_HISTORY} edits of a set are kept.`;

function walk(verb: 'undo' | 'redo', step: typeof undoEdit): Tool['handler'] {
  return async (input, ctx) => {
    const entry = getSheetSet(ctx, text(input, 'document_id'));
    const changed = step(entry);
    const state = { document_id: entry.id, changed, undo_steps: entry.history.undo.length, redo_steps: entry.history.redo.length };
    if (!changed) {
      return okResult(verb === 'undo' ? 'Nothing to undo: no edit has been made to this set in this session (or all were undone).' : 'Nothing to redo: no edit has been undone since the last edit.', state);
    }
    const sheets = sheetsOf(entry);
    return okResult(
      `${verb === 'undo' ? 'Undid' : 'Redid'} one edit. The set has ${sheets.length} sheets (${sheets.map((s) => s.number).join(', ')}) and ${entry.set.document.views.length} views; ${state.undo_steps} to undo, ${state.redo_steps} to redo.`,
      { ...state, sheets: sheets.map((s) => s.number), views: entry.set.document.views.length },
    );
  };
}

export const ifcsheetUndo: Tool = {
  name: 'ifcsheet_undo',
  description:
    `Undo the last edit made to a drawing set by ifcsheet_add_view, ifcsheet_place_view, ifcsheet_set_title_block, ifcsheet_add_schedule or ifcsheet_renumber: the set (views, sheets, title block, schedules) goes back to exactly what it was before that call. Call again to go back further. Dry runs are never in the history, and a call that failed changed nothing, so it has nothing to undo. ${KEPT} When there is nothing to undo the result says so (changed false) and is not an error. Returns changed, undo_steps and redo_steps left, and the sheet numbers now in the set.`,
  scope: 'read',
  inputSchema: { type: 'object', properties: { document_id: DOCUMENT_ID }, required: ['document_id'], additionalProperties: false },
  handler: walk('undo', undoEdit),
};

export const ifcsheetRedo: Tool = {
  name: 'ifcsheet_redo',
  description:
    'Redo the edit ifcsheet_undo took back, on a drawing set. A new edit after an undo ends the undone branch: there is then nothing to redo. When there is nothing to redo the result says so (changed false) and is not an error. Returns changed, undo_steps and redo_steps left, and the sheet numbers now in the set.',
  scope: 'read',
  inputSchema: { type: 'object', properties: { document_id: DOCUMENT_ID }, required: ['document_id'], additionalProperties: false },
  handler: walk('redo', redoEdit),
};

export const ifcsheetHistoryTools: Tool[] = [ifcsheetUndo, ifcsheetRedo];
