/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The material takeoff as a table on paper, in the joinery schedule's
 * primitives (paper millimetres), so it places, prints and exports to DXF
 * the same way: title, a header, one row per material, a total.
 */

import { sheetNumber, type SheetLocale } from '@bimvoice/ifcsheet/names';
import type { ScheduleLayout } from './schedule-layout';
import type { ExportTable } from './schedule-export';
import { layoutPagedTable, PEN, type PagedOptions, type TableBlock } from './paged-table';
import type { TakeoffRow } from './material-takeoff';

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
}

const COLUMNS = [62, 18, 24, 24, 70] as const;

/** The `IfcWall` style class names, without the prefix, for people. */
const plainClass = (c: string): string => c.replace(/^Ifc/, '');

export function layoutMaterialTakeoff(rows: readonly TakeoffRow[], labels: TakeoffLabels, paging: PagedOptions = {}): ScheduleLayout {
  const fixed = (v: number | null, kind: 'volume' | 'area'): string => (v === null ? '–' : sheetNumber(labels.locale, v, 2, { kind }));
  const sum = (key: 'volume' | 'area'): number | null => (rows.some((r) => r[key] !== null) ? rows.reduce((s, r) => s + (r[key] ?? 0), 0) : null);
  const table: string[][] = [
    ...rows.map((r) => [r.material, String(r.elements), fixed(r.volume, 'volume'), fixed(r.area, 'area'), r.classes.map(plainClass).join(', ')]),
    [labels.total, String(rows.reduce((s, r) => s + r.elements, 0)), fixed(sum('volume'), 'volume'), fixed(sum('area'), 'area'), ''],
  ];
  const block: TableBlock = {
    columns: COLUMNS, header: [labels.material, labels.elements, labels.volume, labels.area, labels.usedIn], numeric: (c) => c >= 1 && c <= 3,
    // A frame rule above the total.
    rows: table.map((cells, i) => ({ cells, bold: i === table.length - 1, rule: i === table.length - 2 ? PEN.frame : PEN.grid })),
  };
  return layoutPagedTable(labels.title, 4, [{ kind: 'table', block }], paging);
}

/** The takeoff as the table of its CSV and XLSX: the rows and the total line the sheet prints, volumes and areas unformatted, a figure the model does not give left empty. */
export function takeoffTable(rows: readonly TakeoffRow[], labels: TakeoffLabels): ExportTable {
  const sum = (key: 'volume' | 'area'): number | null => (rows.some((r) => r[key] !== null) ? rows.reduce((s, r) => s + (r[key] ?? 0), 0) : null);
  return {
    name: labels.title || labels.material, header: [labels.material, labels.elements, labels.volume, labels.area, labels.usedIn], numeric: [1, 2, 3], kinds: { 2: 'volume', 3: 'area' },
    rows: [
      ...rows.map((r) => [r.material, r.elements, r.volume, r.area, r.classes.map(plainClass).join(', ')]),
      [labels.total, rows.reduce((s, r) => s + r.elements, 0), sum('volume'), sum('area'), null],
    ],
    bold: [rows.length],
  };
}
