/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';
import { listScheduleRo } from './list-schedule.ro';

/** Romanian for the export of a schedule (`schedule-export.en.ts`). Term choices: `../ro-glossary.md`. */
export const scheduleExportRo = {
  ...listScheduleRo,
  'wall.export.title': 'Export',
  'wall.export.summary': 'CSV și XLSX ale tabelului',
  'wall.export.hint': 'Tabelul așa cum îl tipărește planșa: aceleași rânduri, aceeași ordine și numerotare. Cifrele sunt numere simple; CSV separă coloanele cu {delimiter}.',
  'wall.export.comma': 'virgulă',
  'wall.export.semicolon': 'punct și virgulă (așa le desparte un program de calcul tabelar în limba română)',
  'wall.export.csv': 'CSV',
  'wall.export.xlsx': 'XLSX',
  'wall.export.csvOf': 'CSV pentru {name}',
  'wall.export.xlsxOf': 'XLSX pentru {name}',
  'wall.export.empty': 'Nu e nimic de exportat încă: tabelul nu are rânduri.',
  'wall.export.failed': 'Tabelul nu a putut fi exportat: {reason}',
  'wall.export.fileName': 'tabel',
  'schedule.export.widthMm': 'Lățime (mm)',
  // The headings of the workbook's sheets, which the Wall now writes for every language.
  'schedule.sheet.types': 'Tipuri',
  'schedule.sheet.elements': 'Elemente',
  'schedule.col.number': 'Nr.',
  'schedule.col.level': 'Nivel',
  'schedule.col.globalId': 'GlobalId',
  'schedule.export.heightMm': 'Înălțime (mm)',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
