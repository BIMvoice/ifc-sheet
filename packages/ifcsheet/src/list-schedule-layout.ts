/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A schedule built from the Lists engine (#78) as a table on paper, through the one paged table (`paged-table.ts`, #222): a ruled header,
 * a row per group (or per element), the totals row last and bold. The rows are the engine's `listScheduleTable`, the table the CSV and the XLSX
 * write, so the file holds the rows the sheet prints. A figure is written with the project's "Units and numbers" (#88): its column's
 * kind (an area, a volume, a length) decides its decimals, a count is whole.
 */

import { listTableCells } from './list-figures.js';
import type { ListScheduleTable } from './list-schedule.js';
import { textWidthEm, truncateToWidth } from './text-width.js';
import type { SheetLocale } from './units-and-numbers.js';
import type { ScheduleLayout } from './schedule-prim.js';
import { layoutPagedTable, PAD, PEN, TEXT, type PagedOptions, type TableBlock } from './paged-table.js';

export interface ListSheetLabels {
  /** The language the figures on paper are written in ("12,50" in Romanian); the CSV and XLSX never use it. */
  locale: SheetLocale;
  title: string;
}

const MIN_COLUMN = 16;
const MAX_COLUMN = 80;
/** The widest a table is drawn before its columns are narrowed (a drawing area of A3, landscape, less its margins). */
const MAX_WIDTH = 380;

/** A cell cut at its column's width with "…" (the file keeps it whole). */
const fit = (text: string, column: number, bold: boolean): string => (textWidthEm(text, bold) * TEXT <= column - 2 * PAD ? text : truncateToWidth(text, (column - 2 * PAD) / TEXT, bold));

/** Each column as wide as its widest cell, between a floor and a ceiling; narrowed together when the table would not fit the paper. */
function columnWidths(header: readonly string[], cells: readonly (readonly string[])[], bold: ReadonlySet<number>): number[] {
  const widths = header.map((h, c) => {
    const em = Math.max(textWidthEm(h, true), ...cells.map((row, r) => textWidthEm(row[c] ?? '', bold.has(r))));
    return Math.min(MAX_COLUMN, Math.max(MIN_COLUMN, em * TEXT + 2 * PAD + 1));
  });
  const total = widths.reduce((a, b) => a + b, 0);
  return total <= MAX_WIDTH ? widths : widths.map((w) => Math.max(MIN_COLUMN * 0.75, (w * MAX_WIDTH) / total));
}

export function layoutListSchedule(table: ListScheduleTable, labels: ListSheetLabels, paging: PagedOptions = {}): ScheduleLayout {
  const bold = new Set(table.bold);
  // The cells as text: figures in the sheet's language and the project's format, a missing value as a dash; `ifcsheet list` writes the same (`listTableCells`).
  const cells = listTableCells(table, labels.locale);
  const columns = columnWidths(table.header, cells, bold);
  const numeric = new Set(table.numeric);
  const block: TableBlock = {
    columns, header: table.header.map((h, c) => fit(h, columns[c], true)), numeric: (c) => numeric.has(c), skipEmpty: true,
    rows: cells.map((row, r) => ({
      cells: row.map((text, c) => fit(text, columns[c], bold.has(r))),
      bold: bold.has(r),
      rule: bold.has(r) || r === cells.length - 1 ? PEN.frame : PEN.grid,
    })),
  };
  return layoutPagedTable(labels.title, 4, [{ kind: 'table', block }], paging);
}
