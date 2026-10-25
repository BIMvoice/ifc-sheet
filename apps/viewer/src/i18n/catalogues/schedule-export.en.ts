/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** What the CSV and XLSX export of a schedule says on the Wall's card and in its drawer (#80). Romanian: `schedule-export.ro.ts`. */
export const scheduleExportEn = {
  'wall.export.title': 'Export',
  'wall.export.summary': 'CSV and XLSX of the table',
  'wall.export.hint': 'The table as the sheet prints it: the same rows, order and numbering. Figures are plain numbers; CSV separates the columns with {delimiter}.',
  'wall.export.comma': 'a comma',
  'wall.export.semicolon': 'a semicolon (what a spreadsheet in this language splits on)',
  'wall.export.csv': 'CSV',
  'wall.export.xlsx': 'XLSX',
  'wall.export.csvOf': 'CSV of {name}',
  'wall.export.xlsxOf': 'XLSX of {name}',
  'wall.export.empty': 'Nothing to export yet: the table has no rows.',
  'wall.export.failed': 'Could not export the table: {reason}',
  'wall.export.fileName': 'schedule',
  'schedule.export.widthMm': 'Width (mm)',
  'schedule.export.heightMm': 'Height (mm)',
} as const satisfies Record<string, TranslationValue>;
