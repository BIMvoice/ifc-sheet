/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The quantities by type as a table on paper, in the joinery schedule's
 * primitives (paper millimetres), so it places, prints and exports to DXF the
 * same way: title, a header, per type a line per storey (and a total line when
 * the type spans several), then a total per IFC class of element (no total
 * across classes, see `TypeQuantities.classTotals`). The CSV and XLSX share
 * the same lines.
 */

import { escapeCsvCell } from '@ifc-lite/export';
import type { ScheduleLayout } from './schedule-layout';
import { layoutPagedTable, PEN, type PagedOptions, type TableBlock } from './paged-table';
import type { Totals, TypeQuantities } from './type-quantities';

export interface TypeQuantityLabels {
  title: string;
  type: string;
  class: string;
  level: string;
  count: string;
  length: string;
  area: string;
  volume: string;
  noQto: string;
  total: string;
  noType: string;
  /** The level of an element on no storey. */
  noLevel: string;
}

export interface TypeQuantityLine {
  /** The type's name, or its class and the "(no type)" label. */
  type: string;
  className: string;
  /** The storey, the "total" label on a type's total line. */
  level: string;
  totals: Totals;
  /** The first line of its type; each class total is its own first line. */
  first: boolean;
  total: boolean;
  /** A total per class of element, after the type rows. */
  classTotal: boolean;
}

const plainClass = (c: string): string => c.replace(/^Ifc/, '');

/** The table's lines, in print order. */
export function typeQuantityLines(data: TypeQuantities, labels: TypeQuantityLabels): TypeQuantityLine[] {
  const lines: TypeQuantityLine[] = [];
  for (const row of data.rows) {
    const type = row.typeName ?? `${plainClass(row.className)} ${labels.noType}`;
    const base = { type, className: row.className };
    const levels = data.levels.filter((l) => row.byLevel[l]);
    levels.forEach((l, i) => lines.push({ ...base, level: l || labels.noLevel, totals: row.byLevel[l], first: i === 0, total: false, classTotal: false }));
    if (levels.length > 1) lines.push({ ...base, level: labels.total, totals: row.total, first: false, total: true, classTotal: false });
  }
  for (const c of data.classTotals) lines.push({ type: labels.total, className: c.className, level: '', totals: c.total, first: true, total: true, classTotal: true });
  return lines;
}

const COLUMNS = [58, 28, 28, 14, 20, 20, 20, 14] as const;

const fixed = (v: number | null, digits = 2): string => (v === null ? '–' : v.toFixed(digits));

export function layoutTypeQuantities(data: TypeQuantities, labels: TypeQuantityLabels, paging: PagedOptions = {}): ScheduleLayout {
  const lines = typeQuantityLines(data, labels);
  const block: TableBlock = {
    columns: COLUMNS, header: [labels.type, labels.class, labels.level, labels.count, labels.length, labels.area, labels.volume, labels.noQto], numeric: (c) => c >= 3, skipEmpty: true,
    rows: lines.map((l, i) => ({
      cells: [l.first ? l.type : '', l.first ? plainClass(l.className) : '', l.level, String(l.totals.count), fixed(l.totals.length), fixed(l.totals.area), fixed(l.totals.volume), l.totals.noQto ? String(l.totals.noQto) : ''],
      bold: l.total,
      // A frame rule above the class totals, else a rule under the last line of each type.
      rule: !l.classTotal && lines[i + 1]?.classTotal === true ? PEN.frame : i === lines.length - 1 || lines[i + 1].first ? PEN.grid : 0,
    })),
  };
  return layoutPagedTable(labels.title, 4, [{ kind: 'table', block }], paging);
}

/** The table as CSV, numbers unformatted, the type on every line; type names are model text, so every cell is formula-guarded (#1506). */
export function typeQuantitiesCsv(data: TypeQuantities, labels: TypeQuantityLabels): string {
  const num = (v: number | null) => (v === null ? '' : String(v));
  const lines = [[labels.type, labels.class, labels.level, labels.count, labels.length, labels.area, labels.volume, labels.noQto]];
  for (const l of typeQuantityLines(data, labels)) lines.push([l.type, l.className, l.level, String(l.totals.count), num(l.totals.length), num(l.totals.area), num(l.totals.volume), String(l.totals.noQto)]);
  return lines.map((l) => l.map((c) => escapeCsvCell(c)).join(',')).join('\n');
}
