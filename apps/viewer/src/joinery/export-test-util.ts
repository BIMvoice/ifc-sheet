/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Helpers the schedule tests share to read the CSV and XLSX of a schedule (#80). */

import assert from 'node:assert/strict';
import { exportCsv, type ExportCell, type ExportTable } from './schedule-export';
import { joineryExport, type JoineryExportLabels, type ScheduleLabels, type ScheduleLayout, type SchedulePrim } from './schedule-layout';
import type { ScheduleData } from './schedule-data';

/** The lines of a CSV, without its byte order mark and final line end. */
export const csvLines = (csv: string): string[] => csv.replace(/^﻿/, '').replace(/\r\n$/, '').split('\r\n');

/** The CSV of one table, as the app writes it. */
export const tableCsv = (table: ExportTable, title = 'T', delimiter = ','): string => exportCsv({ title, tables: [table] }, { delimiter });

export const joineryLabels = (l: ScheduleLabels): JoineryExportLabels => ({
  ...l, widthMm: 'Width (mm)', heightMm: 'Height (mm)', types: 'Types', elements: 'Elements', number: 'No.', level: 'Level', globalId: 'GlobalId',
});

export const joineryCsv = (data: ScheduleData, labels: ScheduleLabels, delimiter = ','): string => exportCsv(joineryExport(data, joineryLabels(labels)), { delimiter });

export type Text = Extract<SchedulePrim, { kind: 'text' }>;
export const textsOf = (l: ScheduleLayout): Text[] => l.prims.filter((p): p is Text => p.kind === 'text');

/** A drawn figure read back as a number: the sheet's `1,234.50`, `+2.70`, `±0.00`, `15.00*`, `20.00 %`. */
const figureOf = (drawn: string): number => Number(drawn.replace(/^(>= )/, '').replace(/,/g, '').replace('±', '').replace(/( m²)?( \*| %|\*)$/, ''));

/** Does the drawn text show this cell? A figure to the sheet's two decimals; an empty cell as nothing or a dash. */
export function shows(drawn: string, cell: ExportCell): boolean {
  if (cell === null) return drawn === '' || drawn === '–' || drawn === '—';
  if (typeof cell === 'number') return Math.abs(figureOf(drawn) - cell) < 0.0051;
  if (cell.startsWith('>= ')) return drawn.startsWith('>= ') && Math.abs(figureOf(drawn) - figureOf(cell)) < 0.0051;
  return drawn === cell;
}

/** The table's drawn lines: its texts by baseline, left to right, the title line dropped. */
export function drawnLines(layout: ScheduleLayout): string[][] {
  const by = new Map<number, Text[]>();
  for (const t of textsOf(layout)) by.set(Math.round(t.y * 100), [...(by.get(Math.round(t.y * 100)) ?? []), t]);
  return [...by.entries()].sort((a, b) => a[0] - b[0]).slice(1).map(([, ts]) => ts.sort((a, b) => a.x - b.x).map((t) => t.text));
}

/**
 * Hold each drawn line against the exported row: every drawn text is shown by the next cell that has one; a cell may stay undrawn only
 * when it is empty, or repeats the cell above it (the file repeats a room or a type on every line; the sheet prints it once).
 */
export function assertSameRows(layout: ScheduleLayout, table: ExportTable): void {
  const lines = drawnLines(layout);
  const noteLines = (table.notes ?? []).length ? lines.splice(lines.length - lines.filter((l) => l.length === 1 && (table.notes ?? []).some((n) => n.includes(l[0]) || l[0].replace(/^\*\s*/, '') === n)).length) : [];
  const exported = [...(table.header.length ? [table.header] : []), ...table.rows.filter((r) => r.length > 0)];
  assert.equal(lines.length, exported.length, `${lines.length} drawn lines, ${exported.length} exported rows\n${JSON.stringify(lines)}\n${JSON.stringify(exported)}`);
  exported.forEach((row, r) => {
    const drawn = lines[r];
    let at = 0;
    row.forEach((cell, c) => {
      if (at < drawn.length && shows(drawn[at], cell)) { at++; return; }
      const empty = cell === null || cell === '';
      const repeat = typeof cell === 'string' && exported[r - 1]?.[c] === cell;
      assert.ok(empty || repeat, `row ${r} cell ${c} (${JSON.stringify(cell)}) is not what the sheet draws: ${JSON.stringify(drawn)}`);
    });
    assert.equal(at, drawn.length, `row ${r}: the sheet draws ${JSON.stringify(drawn)}, the file has ${JSON.stringify(row)}`);
  });
  const note = (s: string) => s.replace(/^\*\s*/, '').replace(/\s+/g, ' ').trim();
  assert.equal(note(noteLines.map((l) => l[0]).join(' ')), note((table.notes ?? []).join(' ')), 'the notes under the table');
}

