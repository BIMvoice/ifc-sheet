/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { TranslationValue } from '../types';

/** The issue date and what changed since the last issue (#331), the project's and the model's (#335). */
export const issueChangesEn = {
  'issue.date': 'Issue date',
  'issue.date.hint': 'Printed as the date in the title block of every sheet in this issue, and on the drawing list and in the file names. Today when left empty.',
  'issue.changes.title': 'Since "{name}"',
  'issue.changes.first': 'This is the first issue, so there is nothing to compare it with.',
  'issue.changes.unknown': 'No fingerprint for the previous issue; changes can\'t be listed.',
  'issue.changes.none': 'No sheet has been added, removed or changed since "{name}".',
  'issue.changes.added': { one: 'Added ({count}): {sheets}', other: 'Added ({count}): {sheets}' },
  'issue.changes.removed': { one: 'Removed ({count}): {sheets}', other: 'Removed ({count}): {sheets}' },
  'issue.changes.changed': { one: 'Changed ({count}): {sheets}', other: 'Changed ({count}): {sheets}' },
  'issue.changes.note': 'Compares what the project holds for each sheet (its settings, the views and drafts on it, and its revisions) and the model as it went out with the sheets it changed on (What changed).',
  'issue.changes.reason.edited': 'edited',
  'issue.changes.reason.model': 'model changed',
  'issue.changes.model.unknown': 'The model as it went out was not recorded with that issue, so model changes since that issue can\'t be listed.',
  'issue.changes.model.noModel': 'No model is loaded, so model changes since "{name}" can\'t be listed.',
  'issue.changes.bump': { one: 'Add a revision to this sheet', other: 'Add a revision to these {count} sheets' },
  'issue.changes.bumpHint': { one: 'It changed without a new revision. Adds one revision, dated the issue date.', other: 'They changed without a new revision. Adds one revision, dated the issue date, to each.' },
  'issue.changes.column': 'Change',
  'issue.changes.cell.new': 'New',
  'issue.changes.cell.changed': 'Changed',
  'issue.changes.cell.removed': 'Removed',
} as const satisfies Record<string, TranslationValue>;
