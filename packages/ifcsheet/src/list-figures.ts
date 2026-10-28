/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The figures of a list schedule as they are written for people, on the sheet and on the command line alike: one function, so
 * the app's table and `ifcsheet list` cannot print the same project's numbers differently. A figure follows the project's
 * "Units and numbers" (#88): its column's kind (an area, a volume, a length) decides its decimals, a count is whole. The CSV,
 * XLSX and JSON keep the plain numbers (a machine reads them back).
 */

import { MISSING_QUANTITY } from '@ifc-lite/lists';
import type { ListFigureKind, ListScheduleTable } from './list-schedule.js';
import { sheetNumber } from './sheet-number.js';
import type { SheetLocale } from './units-and-numbers.js';

/** A figure as it is written on paper. */
export function listFigure(locale: SheetLocale, value: number, kind: ListFigureKind | undefined): string {
  if (kind === 'count') return sheetNumber(locale, value, 0, { group: false });
  if (kind === undefined) return sheetNumber(locale, value, 2, { trim: true });
  return sheetNumber(locale, value, 2, { kind });
}

/** The cells of a list table as text: figures in the sheet's language and format, a missing value as a dash. */
export function listTableCells(table: ListScheduleTable, locale: SheetLocale): string[][] {
  return table.rows.map((row) => row.map((v, c) => (v === null ? MISSING_QUANTITY : typeof v === 'number' ? listFigure(locale, v, table.kinds[c]) : String(v))));
}

/** A table as aligned text: the heading, a rule, the rows (the totals row last, then a line for each total that leaves rows out). Figures are written as the sheet writes them (`listTableCells`): the language with the project's "Units and numbers". */
export function listTableText(table: ListScheduleTable, locale: SheetLocale = 'en'): string {
  const cells = [table.header, ...listTableCells(table, locale)];
  const widths = table.header.map((_, c) => Math.max(...cells.map((r) => [...(r[c] ?? '')].length)));
  const line = (r: string[]) => r.map((c, i) => (table.numeric.includes(i) ? c.padStart(widths[i]) : c.padEnd(widths[i]))).join('  ').trimEnd();
  const notes = table.notes.map((n) => `\n${n}`).join('');
  return `${table.name}\n${[line(cells[0]), ...cells.slice(1).map(line)].join('\n')}\n${notes ? `${notes.slice(1)}\n` : ''}`;
}

