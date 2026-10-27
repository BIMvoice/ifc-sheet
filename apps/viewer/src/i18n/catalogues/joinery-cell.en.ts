/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** What the viewport card says about a cell of a door and window schedule picked on the sheet and typed over (#446). Romanian: `joinery-cell.ro.ts`. */
export const joineryCellEn = {
  'joineryCell.title': 'Cells',
  'joineryCell.summary': 'Click a cell to type over it',
  'joineryCell.summaryPicked': '{row} of {type}',
  'joineryCell.hint': 'Click a cell of the table on the sheet to type another text over the model\'s. It prints for that type in every door and window schedule.',
  'joineryCell.gone': 'The picked cell is no longer in the table. Pick another.',
  'joineryCell.heading': '{row}: {type}',
  'joineryCell.model': 'Model: {value}',
  'joineryCell.measured': 'Measured from the element\'s geometry: the model states no size (≈).',
  'joineryCell.value': 'Text on the sheet',
  'joineryCell.overridden': 'Typed over the model\'s text, in every door and window schedule. Marked on the sheet here only; the print carries no mark.',
  'joineryCell.reset': 'Reset to model value',
  'joineryCell.done': 'Done',
  'joineryCell.addColumn': 'Add a column',
  'joineryCell.removeColumn': 'Remove the column {name}',
} satisfies Record<string, TranslationValue>;
