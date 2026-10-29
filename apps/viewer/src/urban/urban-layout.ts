/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The permit's areas and urban indicators as a table on paper, in the
 * joinery schedule's primitives (paper millimetres), so it places, prints
 * and exports to DXF like the other schedules: the storeys with their
 * elevation against ±0.00, built and useful areas and whether Ad for CUT
 * counts them, the useful area by room category, then Ac, Ad, Ad for CUT,
 * Au, the site area, POT and CUT, and under them the rules they were
 * measured by. A figure the model does not give prints as "—".
 */

import type { ScheduleLayout } from '@/joinery/schedule-layout';
import { layoutPagedTable, PEN, type PagedOptions, type TableBlock, type TableItem, wrapNote } from '@bimvoice/ifcsheet';
export { wrapNote };
import { sheetLevel, sheetNumber, type SheetLocale } from '@bimvoice/ifcsheet/names';
import type { ExportCell, ExportTable } from '@/joinery/schedule-export';
import type { UrbanIndicators } from './indicators';

export interface UrbanLabels {
  /** The language the figures are written in ("120,00" in Romanian); passed in, never read from a global. */
  locale: SheetLocale;
  title: string;
  level: string;
  elevation: string;
  built: string;
  useful: string;
  /** The column saying whether Ad for CUT counts a storey, and its two answers. */
  inCut: string;
  yes: string;
  no: string;
  belowGround: (name: string) => string;
  /** The storey containing ±0.00, Ac's. */
  ground: (name: string) => string;
  category: string;
  area: string;
  ac: string;
  ad: string;
  adCut: string;
  au: string;
  site: string;
  pot: string;
  cut: string;
  /** The rule lines printed under the table, from the figures they explain. */
  rules: (r: UrbanIndicators) => string[];
  /** A remark printed under the table (levels whose holes were all counted), or empty. */
  note: string;
  /** A figure that is a lower bound: `≥ 120.00`. */
  atLeast: (value: string) => string;
  /** The footnote for a level with elements that could not be measured. */
  unmeasured: (count: number, level: string) => string;
}

/** An elevation as drawings write it: +2.70, -1.50, ±0.00. */
export function signedLevel(locale: SheetLocale, v: number): string {
  return sheetLevel(locale, v);
}

const GAP = 4;
/** Level, elevation, built, useful, in Ad for CUT; the two-column tables span the same width. */
const STOREY_COLUMNS = [56, 20, 28, 28, 14] as const;
const WIDTH = STOREY_COLUMNS.reduce((a, b) => a + b, 0);
const PAIR_COLUMNS = [WIDTH - 30, 30] as const;

export const NONE = '—';
const m2Of = (locale: SheetLocale, v: number | null): string => (v === null ? NONE : sheetNumber(locale, v, 2, { kind: 'area' }));

/** One ruled table; columns after the first are right-aligned figures; the last row closes it with the frame pen. */
function figures(columns: readonly number[], rows: readonly string[][], header: boolean): TableItem {
  const body = header ? rows.slice(1) : rows;
  const block: TableBlock = {
    columns, header: header ? rows[0] : undefined, numeric: (c) => c > 0,
    rows: body.map((cells, i) => ({ cells, rule: i === body.length - 1 ? PEN.frame : PEN.grid })),
  };
  return { kind: 'table', block };
}

export function layoutUrban(r: UrbanIndicators, labels: UrbanLabels, paging: PagedOptions = {}): ScheduleLayout {
  const { locale } = labels;
  const m2 = (v: number | null) => m2Of(locale, v);
  const low = (text: string, atLeast: boolean) => (atLeast && text !== NONE ? labels.atLeast(text) : text);
  const items: TableItem[] = [figures(STOREY_COLUMNS, [
    [labels.level, labels.elevation, labels.built, labels.useful, labels.inCut],
    ...r.storeys.map((s) => [
      s.belowGround ? labels.belowGround(s.name) : s.ground ? labels.ground(s.name) : s.name,
      signedLevel(locale, s.elevation), low(m2(s.builtArea), s.unmeasured > 0), m2(s.usefulArea), s.inCut ? labels.yes : labels.no,
    ]),
  ], true)];
  if (r.auByCategory.length) {
    items.push({ kind: 'gap', h: GAP }, figures(PAIR_COLUMNS, [[labels.category, labels.area], ...r.auByCategory.map((c) => [c.category, m2(c.area)])], true));
  }
  items.push({ kind: 'gap', h: GAP }, figures(PAIR_COLUMNS, [
    [labels.ac, low(m2(r.ac), r.acAtLeast)],
    [labels.ad, low(m2(r.ad), r.adAtLeast)],
    [labels.adCut, low(m2(r.adCut), r.adCutAtLeast)],
    [labels.au, m2(r.au)],
    [labels.site, m2(r.siteArea)],
    [labels.pot, low(r.pot === null ? NONE : `${sheetNumber(locale, r.pot)} %`, r.acAtLeast)],
    [labels.cut, low(r.cut === null ? NONE : sheetNumber(locale, r.cut), r.adCutAtLeast)],
  ], false));
  const notes = [
    ...labels.rules(r),
    ...r.storeys.filter((s) => s.unmeasured > 0).map((s) => labels.unmeasured(s.unmeasured, s.name)),
    ...(labels.note ? [labels.note] : []),
  ].flatMap((note) => wrapNote(note));
  // Each note is a 2 mm line under a GAP; the last leaves 1 mm.
  for (const text of notes) items.push({ kind: 'text', h: GAP, dy: GAP, size: 2, text });
  return layoutPagedTable(labels.title, 4, items, { ...paging, tail: notes.length ? 1 : 0 });
}

/**
 * The indicators as the table of the CSV and XLSX: the blocks the sheet prints one under the other (storeys, useful area by category,
 * Ac to CUT), each with its own heading row, areas as numbers, then the rules and notes. A figure that is a lower bound stays text
 * (`≥ 120`), as on paper: a bare number would claim more than the model gives.
 */
export function urbanTable(r: UrbanIndicators, labels: UrbanLabels): ExportTable {
  const figure = (v: number | null, atLeast = false): ExportCell => (v === null ? null : atLeast ? labels.atLeast(String(v)) : v);
  const rows: ExportCell[][] = [[labels.level, labels.elevation, labels.built, labels.useful, labels.inCut]];
  const bold = [0];
  for (const s of r.storeys) {
    rows.push([s.belowGround ? labels.belowGround(s.name) : s.ground ? labels.ground(s.name) : s.name, s.elevation, figure(s.builtArea, s.unmeasured > 0), s.usefulArea, s.inCut ? labels.yes : labels.no]);
  }
  if (r.auByCategory.length) {
    rows.push([], [labels.category, labels.area]);
    bold.push(rows.length - 1);
    for (const c of r.auByCategory) rows.push([c.category, c.area]);
  }
  rows.push([], [labels.ac, figure(r.ac, r.acAtLeast)], [labels.ad, figure(r.ad, r.adAtLeast)], [labels.adCut, figure(r.adCut, r.adCutAtLeast)], [labels.au, r.au], [labels.site, r.siteArea],
    [labels.pot, figure(r.pot, r.acAtLeast)], [labels.cut, figure(r.cut, r.adCutAtLeast)]);
  return {
    name: labels.title || labels.level, header: [], rows, bold, numeric: [1, 2, 3],
    notes: [
      ...labels.rules(r),
      ...r.storeys.filter((s) => s.unmeasured > 0).map((s) => labels.unmeasured(s.unmeasured, s.name)),
      ...(labels.note ? [labels.note] : []),
    ],
  };
}
