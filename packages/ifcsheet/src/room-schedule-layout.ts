/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The room and area schedule as a table on paper (#42), through the one paged
 * table (`paged-table.ts`, #222): a bold row per level, its rooms (number, name,
 * area, perimeter), the level's total; the building's total last, which is Au. A
 * room's area that comes from its geometry (the model states none) carries a `*`.
 * Under it the area summary (Su, Sc, Sd per level and for the building, once the
 * footprints are measured) and the notes that say where the areas come from, as
 * the urban sheet's do. The rows are the engine's (`roomScheduleLines`), so the
 * command line prints the same table.
 */

import { sheetNumber } from './sheet-number.js';
import type { SheetLocale } from './units-and-numbers.js';
import { roomScheduleLines, type RoomSchedule, type RoomScheduleLine, type RoomScheduleWords } from './room-schedule.js';
import type { ScheduleLayout } from './schedule-prim.js';
import { layoutPagedTable, PEN, type PagedOptions, type TableBlock, type TableItem } from './paged-table.js';
import { summaryItems, type RoomSummaryBlock } from './room-summary-layout.js';
import { wrapNote } from './wrap-note.js';

export interface RoomScheduleLabels extends RoomScheduleWords {
  /** The language the figures on paper are written in ("12,50" in Romanian). */
  locale: SheetLocale;
  title: string;
  /** Notes under the table, already in the user's language: where the areas come from; what was left out. */
  notes: readonly string[];
  /** The area summary under the table; absent until the storeys' footprints are measured. */
  summary?: RoomSummaryBlock | null;
}

const COLUMNS = [14, 62, 27, 27] as const;
const NONE = '–';
/** Square metres, written with the superscript two (U+00B2, in WinAnsi and Windows-1252: the PDF and DXF print it). */
export const AREA_UNIT = 'm\u00b2';
const GAP = 4;

/** The bold rows: a level's name (above its rooms), its total and the building's. */
const isTotal = (l: RoomScheduleLine) => l.kind !== 'room';

/** The table's rows: a level's name, its rooms, its total. */
export function roomScheduleCells(schedule: RoomSchedule, labels: RoomScheduleWords & { locale: SheetLocale }): { cells: string[]; bold: boolean; rule: number }[] {
  const lines = roomScheduleLines(schedule, labels);
  const rows: { cells: string[]; bold: boolean; rule: number }[] = [];
  lines.forEach((l, i) => {
    if (l.kind === 'room' && (i === 0 || lines[i - 1].kind !== 'room')) rows.push({ cells: ['', l.level, '', ''], bold: true, rule: PEN.grid });
    // The unit sits in the cell, so a trailing `*` is never read as a stand-in for it: the star marks an estimated area only.
    const area = l.area === null ? NONE : `${sheetNumber(labels.locale, l.area, 2, { kind: 'area' })} ${AREA_UNIT}${l.source === 'geometry' ? ' *' : ''}`;
    const perimeter = l.kind !== 'room' ? '' : l.perimeter === null ? NONE : sheetNumber(labels.locale, l.perimeter, 2, { kind: 'length' });
    rows.push({ cells: [l.number, l.name, area, perimeter], bold: isTotal(l), rule: isTotal(l) ? PEN.frame : PEN.grid });
  });
  return rows;
}

export function layoutRoomSchedule(schedule: RoomSchedule, labels: RoomScheduleLabels, paging: PagedOptions = {}): ScheduleLayout {
  const block: TableBlock = {
    columns: COLUMNS, header: [labels.number, labels.room, labels.area, labels.perimeter], numeric: (c) => c >= 2, skipEmpty: true,
    rows: roomScheduleCells(schedule, labels),
  };
  const notes = [...labels.notes, ...(labels.summary?.words.notes ?? [])].flatMap((note) => wrapNote(note, 110));
  const items: TableItem[] = [{ kind: 'table', block }, ...(labels.summary ? summaryItems(labels.summary, labels.locale) : [])];
  if (notes.length) items.push({ kind: 'gap', h: GAP });
  for (const text of notes) items.push({ kind: 'text', h: GAP, dy: GAP, size: 2, text });
  return layoutPagedTable(labels.title, 4, items, { ...paging, tail: notes.length ? 1 : 0 });
}
