/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The one CSV writer of every schedule (#80), moved from the app (`joinery/schedule-export.ts`, which keeps the XLSX writer and re-exports
 * these) so the command line and the MCP tools write a schedule's file with the same function and the same formula guard (#1506).
 *
 * CSV is machine-readable: figures are plain numbers (`1234.5`, never `1.234,5`; the sheet's language does not change them).
 * It is UTF-8 with a byte order mark (Excel reads a file without one as the system's ANSI code page and breaks Romanian
 * diacritics), CRLF line ends, and `,` or `;` as the delimiter (`csvDelimiter`).
 */

import { escapeCsvCell } from '@ifc-lite/export';
import { decimalMarkOf, type NumberKind, type SheetLocale } from './units-and-numbers.js';

/** A cell: text, a figure, or empty. */
export type ExportCell = string | number | null;

export interface ExportTable {
  /** The worksheet's name (XLSX), cut to Excel's 31 characters. */
  name: string;
  /** The column headings; empty for a table that carries its own heading rows (the urban indicators). */
  header: readonly string[];
  /** The rows as the sheet prints them: same order, same rows, figures unformatted. An empty row is a gap. */
  rows: readonly (readonly ExportCell[])[];
  /** Rows set in bold (totals, a heading row inside the table), by index in `rows`. */
  bold?: readonly number[];
  /** Columns that hold figures (right-aligned in XLSX). */
  numeric?: readonly number[];
  /** What a figure column measures, by column index: the XLSX gives its cells the project's decimals for that kind (#88). */
  kinds?: Readonly<Record<number, NumberKind>>;
  /** Lines the sheet prints under the table (notes, rules), one cell each. */
  notes?: readonly string[];
  /** Rows the file adds that the sheet does not print (a total row), after `rows`. */
  footer?: readonly (readonly ExportCell[])[];
  /** Part of the workbook only: not in the CSV (the Elements sheet of a joinery schedule). */
  workbookOnly?: boolean;
}

export interface ScheduleExport {
  /** The schedule's title, the bold first row of every worksheet. */
  title: string;
  tables: readonly ExportTable[];
}

const BOM = '﻿';

/**
 * The delimiter a spreadsheet in `locale` splits a double-clicked .csv on: Excel takes the system's list separator, which is `;`
 * wherever the decimal mark is a comma (Romanian, German, French ...) and `,` elsewhere. The figures stay `.`-decimal either way.
 */
export function csvDelimiter(locale: SheetLocale): ',' | ';' {
  // The project's separator (#88) decides it like the language does: a comma project opens in a spreadsheet that wants `;`.
  return decimalMarkOf(locale) === ',' ? ';' : ',';
}

/** One CSV cell: text is guarded (a number-shaped identifier like `-007` too), a figure is written as is. */
function csvCell(v: ExportCell, delimiter: string): string {
  if (v === null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? escapeCsvCell(String(v), { delimiter, exemptNumbers: true }) : '';
  return escapeCsvCell(v, { delimiter, exemptNumbers: false });
}

/** The CSV of the schedule: the tables that are not workbook-only, a blank line between them, the notes under each. */
export function exportCsv(data: ScheduleExport, options: { delimiter?: string } = {}): string {
  const delimiter = options.delimiter ?? ',';
  const line = (cells: readonly ExportCell[]) => cells.map((c) => csvCell(c, delimiter)).join(delimiter);
  const blocks = data.tables.filter((t) => !t.workbookOnly).map((t) => [
    ...(t.header.length ? [line(t.header)] : []),
    ...t.rows.map(line),
    ...(t.footer ?? []).map(line),
    ...(t.notes ?? []).map((n) => line([n])),
  ].join('\r\n'));
  return `${BOM}${blocks.join('\r\n\r\n')}\r\n`;
}
