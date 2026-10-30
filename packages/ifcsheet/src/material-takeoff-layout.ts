/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The material takeoff as a table on paper, in the joinery schedule's
 * primitives (paper millimetres), so it places, prints and exports to DXF
 * the same way: title, a header, one row per material, a total. A figure with
 * any part measured from geometry carries a `*`, explained under the table
 * (#74, `measured-marks.ts`).
 */

import { sheetNumber } from './sheet-number.js';
import type { SheetLocale } from './units-and-numbers.js';
import type { ScheduleLayout } from './schedule-prim.js';
import type { ExportTable } from './schedule-csv.js';
import { layoutPagedTable, PEN, type PagedOptions, type TableBlock } from './paged-table.js';
import type { TakeoffRow } from './material-takeoff.js';
import { marked, measuredCell, measuredNoteItems, type MeasuredWords } from './measured-marks.js';

export interface TakeoffLabels {
  title: string;
  material: string;
  elements: string;
  volume: string;
  area: string;
  usedIn: string;
  total: string;
  /** The language the figures on paper are written in; the CSV never uses it. */
  locale: SheetLocale;
  /** How measured figures are explained (#74); without it they are still marked, with no note or column. */
  measured?: MeasuredWords;
}

const COLUMNS = [62, 18, 24, 24, 70] as const;

/** The `IfcWall` style class names, without the prefix, for people. */
const plainClass = (c: string): string => c.replace(/^Ifc/, '');

export function layoutMaterialTakeoff(rows: readonly TakeoffRow[], labels: TakeoffLabels, paging: PagedOptions = {}): ScheduleLayout {
  const fixed = (v: number | null, kind: 'volume' | 'area', measured: boolean): string => (v === null ? '–' : marked(sheetNumber(labels.locale, v, 2, { kind }), measured));
  const sum = (key: 'volume' | 'area'): number | null => (rows.some((r) => r[key] !== null) ? rows.reduce((s, r) => s + (r[key] ?? 0), 0) : null);
  const anyVolume = rows.some((r) => r.measuredVolume), anyArea = rows.some((r) => r.measuredArea);
  const table: string[][] = [
    ...rows.map((r) => [r.material, String(r.elements), fixed(r.volume, 'volume', r.measuredVolume === true), fixed(r.area, 'area', r.measuredArea === true), r.classes.map(plainClass).join(', ')]),
    [labels.total, String(rows.reduce((s, r) => s + r.elements, 0)), fixed(sum('volume'), 'volume', anyVolume), fixed(sum('area'), 'area', anyArea), ''],
  ];
  const block: TableBlock = {
    columns: COLUMNS, header: [labels.material, labels.elements, labels.volume, labels.area, labels.usedIn], numeric: (c) => c >= 1 && c <= 3,
    // A frame rule above the total.
    rows: table.map((cells, i) => ({ cells, bold: i === table.length - 1, rule: i === table.length - 2 ? PEN.frame : PEN.grid })),
  };
  const notes = measuredNoteItems(anyVolume || anyArea, rows.reduce((s, r) => s + (r.unmeasuredVolume ?? 0), 0), labels.measured);
  return layoutPagedTable(labels.title, 4, [{ kind: 'table', block }, ...notes], { ...paging, tail: notes.length ? 1 : 0 });
}

/**
 * The takeoff as the table of its CSV and XLSX: the rows and the total line the sheet prints, volumes and areas unformatted, a figure the
 * model does not give left empty. When a figure is measured from geometry, a last column names the measured figures of each row (#74).
 */
export function takeoffTable(rows: readonly TakeoffRow[], labels: TakeoffLabels): ExportTable {
  const sum = (key: 'volume' | 'area'): number | null => (rows.some((r) => r[key] !== null) ? rows.reduce((s, r) => s + (r[key] ?? 0), 0) : null);
  const words = labels.measured;
  const column = words && rows.some((r) => r.measuredVolume || r.measuredArea) ? words : null;
  const tail = (r: TakeoffRow | null): (string | null)[] => (column ? [r ? measuredCell(r.measuredVolume === true, r.measuredArea === true, column) : null] : []);
  return {
    name: labels.title || labels.material, header: [labels.material, labels.elements, labels.volume, labels.area, labels.usedIn, ...(column ? [column.column] : [])], numeric: [1, 2, 3], kinds: { 2: 'volume', 3: 'area' },
    rows: [
      ...rows.map((r) => [r.material, r.elements, r.volume, r.area, r.classes.map(plainClass).join(', '), ...tail(r)]),
      [labels.total, rows.reduce((s, r) => s + r.elements, 0), sum('volume'), sum('area'), null, ...tail(null)],
    ],
    bold: [rows.length],
  };
}
