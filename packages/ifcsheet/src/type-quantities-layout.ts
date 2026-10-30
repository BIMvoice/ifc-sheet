/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The quantities by type as a table on paper, in the joinery schedule's
 * primitives (paper millimetres), so it places, prints and exports to DXF the
 * same way: title, a header, per type a line per storey (and a total line when
 * the type spans several), then a total per IFC class of element (no total
 * across classes, see `TypeQuantities.classTotals`). The CSV and XLSX share
 * the same lines. A figure with any part measured from geometry carries a `*`,
 * explained under the table (#74, `measured-marks.ts`).
 */

import { sheetNumber } from './sheet-number.js';
import type { SheetLocale } from './units-and-numbers.js';
import type { ScheduleLayout } from './schedule-prim.js';
import type { ExportTable } from './schedule-csv.js';
import { layoutPagedTable, PEN, type PagedOptions, type TableBlock } from './paged-table.js';
import { marked, measuredCell, measuredNoteItems, type MeasuredWords } from './measured-marks.js';
import type { Totals, TypeQuantities } from './type-quantities.js';

export interface TypeQuantityLabels {
  /** The language the figures on paper are written in ("12,50" in Romanian); the CSV and XLSX never use it. */
  locale: SheetLocale;
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
  /** The classification columns (#89) and the heading of the types no code reaches. */
  classification: string;
  classificationTitle: string;
  unclassified: string;
  /** How measured figures are explained (#74); without it they are still marked, with no note or column. */
  measured?: MeasuredWords;
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
  /** The classification of the type (#89); absent when the schedule shows none. */
  code?: string;
  codeTitle?: string;
  /** A heading line above the types of one code (grouped by classification): no figures. */
  heading?: boolean;
}

const HEADING_TOTALS: Totals = { count: 0, noQto: 0, length: null, area: null, volume: null };

const plainClass = (c: string): string => c.replace(/^Ifc/, '');

/** The table's lines, in print order. */
export function typeQuantityLines(data: TypeQuantities, labels: TypeQuantityLabels): TypeQuantityLine[] {
  const lines: TypeQuantityLine[] = [];
  let group: string | null = null;
  let started = false;
  for (const row of data.rows) {
    const type = row.typeName ?? `${plainClass(row.className)} ${labels.noType}`;
    const base = { type, className: row.className, ...(data.classified ? { code: row.classification?.code ?? '', codeTitle: row.classification?.title ?? '' } : {}) };
    // Grouped by classification: a heading when the code changes (rows are in code order), the unclassified last under their own.
    if (data.grouped && (!started || (row.classification?.code ?? null) !== group)) {
      started = true;
      group = row.classification?.code ?? null;
      const heading = group === null ? labels.unclassified : [group, row.classification?.title].filter(Boolean).join('  ');
      lines.push({ type: heading, className: '', level: '', totals: HEADING_TOTALS, first: true, total: false, classTotal: false, heading: true });
    }
    const levels = data.levels.filter((l) => row.byLevel[l]);
    levels.forEach((l, i) => lines.push({ ...base, level: l || labels.noLevel, totals: row.byLevel[l], first: i === 0, total: false, classTotal: false }));
    if (levels.length > 1) lines.push({ ...base, level: labels.total, totals: row.total, first: false, total: true, classTotal: false });
  }
  for (const c of data.classTotals) lines.push({ type: labels.total, className: c.className, level: '', totals: c.total, first: true, total: true, classTotal: true });
  return lines;
}

const COLUMNS = [58, 28, 28, 14, 20, 20, 20, 14] as const;
/** With classification (#89) the code and its title come after the class. */
const CLASSIFIED_COLUMNS = [58, 28, 24, 44, 28, 14, 20, 20, 20, 14] as const;

const fixed = (locale: SheetLocale, v: number | null, kind: 'length' | 'area' | 'volume', measured = false): string => (v === null ? '–' : marked(sheetNumber(locale, v, 2, { kind }), measured));

/** The header cells: type, class, [classification, title,] level, count, length, area, volume, no quantity. */
const headerOf = (data: TypeQuantities, labels: TypeQuantityLabels): string[] => [
  labels.type, labels.class, ...(data.classified ? [labels.classification, labels.classificationTitle] : []), labels.level, labels.count, labels.length, labels.area, labels.volume, labels.noQto,
];

export function layoutTypeQuantities(data: TypeQuantities, labels: TypeQuantityLabels, paging: PagedOptions = {}): ScheduleLayout {
  const lines = typeQuantityLines(data, labels);
  const lead = data.classified ? 4 : 2;
  const block: TableBlock = {
    columns: data.classified ? CLASSIFIED_COLUMNS : COLUMNS, header: headerOf(data, labels), numeric: (c) => c >= lead + 1, skipEmpty: true,
    rows: lines.map((l, i) => ({
      cells: l.heading
        ? [l.type, ...headerOf(data, labels).slice(1).map(() => '')]
        : [
          l.first ? l.type : '', l.first ? plainClass(l.className) : '', ...(data.classified ? [l.first ? l.code ?? '' : '', l.first ? l.codeTitle ?? '' : ''] : []),
          l.level, String(l.totals.count), fixed(labels.locale, l.totals.length, 'length'), fixed(labels.locale, l.totals.area, 'area', (l.totals.measuredArea ?? 0) > 0), fixed(labels.locale, l.totals.volume, 'volume', (l.totals.measuredVolume ?? 0) > 0), l.totals.noQto ? String(l.totals.noQto) : '',
        ],
      bold: l.total || l.heading === true,
      // A frame rule above the class totals, else a rule under the last line of each type.
      rule: l.heading ? 0 : !l.classTotal && lines[i + 1]?.classTotal === true ? PEN.frame : i === lines.length - 1 || lines[i + 1].first ? PEN.grid : 0,
    })),
  };
  // Each element is in one class total: those lines count the whole schedule once.
  const classLines = lines.filter((l) => l.classTotal);
  const notes = measuredNoteItems(classLines.some((l) => (l.totals.measuredArea ?? 0) + (l.totals.measuredVolume ?? 0) > 0), classLines.reduce((s, l) => s + (l.totals.unmeasuredVolume ?? 0), 0), labels.measured);
  return layoutPagedTable(labels.title, 4, [{ kind: 'table', block }, ...notes], { ...paging, tail: notes.length ? 1 : 0 });
}

/**
 * The quantities as the table of its CSV and XLSX: the lines the sheet prints (totals in bold), the type and class (as printed, without `Ifc`) on
 * every line, figures unformatted. With classification (#89) the code and its title are on every line too, and the grouping headings are left out:
 * a spreadsheet filters by the code column, the rows stay in code order.
 */
export function typeQuantityTable(data: TypeQuantities, labels: TypeQuantityLabels): ExportTable {
  const lines = typeQuantityLines(data, labels).filter((l) => !l.heading);
  const shift = data.classified ? 2 : 0;
  // When a figure is measured from geometry, a last column names the measured figures of each line (#74).
  const words = labels.measured;
  const column = words && lines.some((l) => (l.totals.measuredArea ?? 0) + (l.totals.measuredVolume ?? 0) > 0) ? words : null;
  const tail = (t: Totals): (string | null)[] => (column ? [measuredCell((t.measuredVolume ?? 0) > 0, (t.measuredArea ?? 0) > 0, column)] : []);
  return {
    name: labels.title || labels.type, header: [...headerOf(data, labels), ...(column ? [column.column] : [])], numeric: [3, 4, 5, 6, 7].map((c) => c + shift), kinds: { [4 + shift]: 'length', [5 + shift]: 'area', [6 + shift]: 'volume' },
    rows: lines.map((l) => [l.type, plainClass(l.className), ...(data.classified ? [l.code ?? '', l.codeTitle ?? ''] : []), l.level, l.totals.count, l.totals.length, l.totals.area, l.totals.volume, l.totals.noQto || null, ...tail(l.totals)]),
    bold: lines.flatMap((l, i) => (l.total ? [i] : [])),
  };
}
