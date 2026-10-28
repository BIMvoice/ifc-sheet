/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The area summary under the room schedule (#42): Su, Sc and Sd per level and for the building (`urban/area-summary.ts`), as the
 * lines of the paged table the sheet draws and as the table the CSV and XLSX hold, from the same rows: the file has the figures the
 * sheet prints, the sheet's written with the project's separators (#88), the file's as numbers.
 */

import { sheetNumber, type SheetLocale } from '@bimvoice/ifcsheet/names';
import type { ExportCell, ExportTable } from '@/joinery/schedule-export';
import type { AreaSummary } from '@/urban/area-summary';
import { PEN, type TableBlock, type TableItem } from './paged-table';

export interface RoomSummaryWords {
  /** The heading over the summary. */
  heading: string;
  level: string;
  /** The column headings: usable, built and gross floor area, with their abbreviations. */
  su: string;
  sc: string;
  sd: string;
  building: string;
  noLevel: string;
  /** A figure that is a lower bound: `≥ 120.00`. */
  atLeast: (value: string) => string;
  /** What Su, Sc and Sd are and where they come from, printed under the summary. */
  notes: readonly string[];
}

/** The summary and the words it is printed with; what the room schedule's labels carry once the footprints are measured. */
export interface RoomSummaryBlock {
  summary: AreaSummary;
  words: RoomSummaryWords;
}

const COLUMNS = [46, 28, 28, 28] as const;
const NONE = '–';
const GAP = 4;

type Figure<T> = (v: number | null, atLeast: boolean) => T;

/** The summary's rows: a line per level then the building's (bold); each figure made by `figure`. */
function rows<T>(summary: AreaSummary, words: RoomSummaryWords, figure: Figure<T>): { cells: (string | T)[]; bold: boolean }[] {
  const out = summary.levels.map((l) => ({ cells: [l.name || words.noLevel, figure(l.su, false), figure(l.sc, l.atLeast), figure(l.sd, l.atLeast)], bold: false }));
  const b = summary.building;
  return [...out, { cells: [words.building, figure(b.su, false), figure(b.sc, b.scAtLeast), figure(b.sd, b.sdAtLeast)], bold: true }];
}

const header = (words: RoomSummaryWords): string[] => [words.level, words.su, words.sc, words.sd];

/** The summary as items of the paged table: a gap, its heading, the table. (Its notes are the schedule's, under both tables.) */
export function summaryItems(block: RoomSummaryBlock, locale: SheetLocale): TableItem[] {
  const { summary, words } = block;
  const text = (v: number | null, atLeast: boolean): string => {
    if (v === null) return NONE;
    const n = sheetNumber(locale, v, 2, { kind: 'area' });
    return atLeast ? words.atLeast(n) : n;
  };
  const body = rows(summary, words, text);
  const table: TableBlock = {
    columns: COLUMNS, header: header(words), numeric: (c) => c > 0,
    rows: body.map((r, i) => ({ cells: r.cells as string[], bold: r.bold, rule: i === body.length - 1 ? PEN.frame : PEN.grid })),
  };
  return [
    { kind: 'gap', h: GAP },
    { kind: 'text', h: GAP + 1, dy: GAP, size: 3, text: words.heading, bold: true },
    { kind: 'table', block: table },
  ];
}

/** The summary as a worksheet: the figures as numbers (a lower bound, which is not one, as its text). */
export function summaryTable(block: RoomSummaryBlock): ExportTable {
  const { summary, words } = block;
  const num = (v: number): number => Math.round(v * 1e6) / 1e6;
  const figure: Figure<ExportCell> = (v, atLeast) => (v === null ? null : atLeast ? words.atLeast(String(num(v))) : num(v));
  const body = rows(summary, words, figure);
  return {
    name: words.heading, header: header(words), rows: body.map((r) => r.cells as ExportCell[]),
    bold: [body.length - 1], numeric: [1, 2, 3], kinds: { 1: 'area', 2: 'area', 3: 'area' }, notes: words.notes,
  };
}
