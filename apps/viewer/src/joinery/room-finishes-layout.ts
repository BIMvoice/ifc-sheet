/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The room finishes as a table on paper, in the joinery schedule's primitives
 * (paper millimetres), so it places, prints and exports to DXF the same way:
 * title, a header, a line per finish of each room. The CSV and XLSX share the
 * same lines (`finishLines`).
 */

import { sheetNumber } from '@bimvoice/ifcsheet/names';
import type { ScheduleLayout } from './schedule-layout';
import type { ExportTable } from './schedule-export';
import { layoutPagedTable, PEN, ROW, TEXT, type PagedOptions, type TableBlock, type TableItem } from './paged-table';
import { finishLines, hasSharedFinish, SURFACES, type Finish, type FinishLine, type RoomFinishes } from './room-finishes';

export interface RoomFinishLabels {
  /** The language the figures on paper are written in ("12,50" in Romanian); the CSV and XLSX never use it. */
  locale: string;
  title: string;
  number: string;
  room: string;
  level: string;
  floor: string;
  wall: string;
  ceiling: string;
  /** The area column's heading, with its unit. */
  area: string;
  /** The note under the table when an area is a share of a covering several rooms use (those areas carry a `*`). */
  sharedNote: string;
}

const COLUMNS = [14, 34, 22, 40, 14, 40, 14, 40, 14] as const;

const fixed = (locale: string, v: number | null): string => (v === null ? '–' : sheetNumber(locale, v));
/** A finish's area on paper: a `*` marks a share of a covering several rooms use. */
const paperArea = (locale: string, f: Finish): string => `${fixed(locale, f.area)}${f.sharedBy > 1 && f.area !== null ? '*' : ''}`;

/** The header cells: three room columns, then a finish and an area per surface. */
export function finishHeader(labels: RoomFinishLabels): string[] {
  return [labels.number, labels.room, labels.level, ...SURFACES.flatMap((s) => [labels[s], labels.area])];
}

/** A line's cells as text: room, then name and area of each surface. */
function cells(l: FinishLine, locale: string): string[] {
  return [
    l.first ? l.number : '', l.first ? l.name : '', l.first ? l.level : '',
    ...SURFACES.flatMap((s) => { const f = l[s]; return f ? [f.name, paperArea(locale, f)] : ['', '']; }),
  ];
}

export function layoutRoomFinishes(rooms: readonly RoomFinishes[], labels: RoomFinishLabels, paging: PagedOptions = {}): ScheduleLayout {
  const lines = finishLines(rooms);
  const block: TableBlock = {
    columns: COLUMNS, header: finishHeader(labels), numeric: (c) => c >= 3 && c % 2 === 0, skipEmpty: true,
    // A rule under the last line of each room.
    rows: lines.map((l, i) => ({ cells: cells(l, labels.locale), rule: i === lines.length - 1 || lines[i + 1].first ? PEN.grid : 0 })),
  };
  const note: TableItem[] = hasSharedFinish(rooms) ? [{ kind: 'text', h: ROW, dy: ROW / 2 + TEXT * 0.35, size: TEXT, text: labels.sharedNote, bold: false }] : [];
  return layoutPagedTable(labels.title, 4, [{ kind: 'table', block }, ...note], paging);
}

/** The table's rows for CSV and XLSX: the room on every line, areas unformatted ('' when the model gives none); a shared covering's area is this room's equal share. */
export function finishRows(rooms: readonly RoomFinishes[]): (string | number | null)[][] {
  return finishLines(rooms).map((l) => [
    l.number, l.name, l.level,
    ...SURFACES.flatMap((s) => [l[s]?.name ?? '', l[s]?.area ?? null]),
  ]);
}

/** The finishes as the table of its CSV and XLSX: `finishRows`, and under them the note the sheet prints when an area is a share of a covering several rooms use. */
export function finishTable(rooms: readonly RoomFinishes[], labels: RoomFinishLabels): ExportTable {
  return {
    name: labels.title || labels.room, header: finishHeader(labels), rows: finishRows(rooms), numeric: SURFACES.map((_, i) => 4 + 2 * i),
    notes: hasSharedFinish(rooms) ? [labels.sharedNote.replace(/^\*\s*/, '')] : [],
  };
}
