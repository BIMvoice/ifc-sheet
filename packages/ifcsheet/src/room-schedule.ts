/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The room and area schedule (#42): the rooms of the model by level, each with
 * its number, name and area, a total per level and one for the building. Pure:
 * the rooms come in as `RoomRecord`s, read by `room-read.ts` (command line) or
 * by the app's collector; their areas are decided by `room-areas.ts`, the one
 * rule the urban indicators' Au is also measured by, so the building total here
 * is Au, not a second sum.
 */

import { escapeCsvCell } from '@ifc-lite/export';
import { sheetNumber } from './sheet-number.js';
import { languageOf, type SheetLocale } from './units-and-numbers.js';
import type { AreaSource } from './room-areas.js';
import type { ExportCell, ExportTable } from './schedule-csv.js';

export interface RoomRecord {
  /** The space's GlobalId (or its model and express id): what two reads of the same room agree on. */
  id: string;
  /** `Name` when a `LongName` names the room (a room number), else empty. */
  number: string;
  /** `LongName`, else `Name`. */
  name: string;
  /** Index into the levels the schedule is given; null for a room on none. */
  level: number | null;
  /** m²; null when neither the model nor the geometry gives one. */
  area: number | null;
  source: AreaSource | null;
  /** m, the outline of the footprint of the room's geometry (`meshFootprintPerimeter`, the footprint the area falls back to); null without geometry. */
  perimeter: number | null;
}

export interface ScheduleLevelInfo {
  name: string;
  /** Metres, to order the levels; null when unknown (those go last). */
  elevation: number | null;
}

export interface RoomScheduleLevel {
  /** Empty for the rooms on no level. */
  name: string;
  rooms: RoomRecord[];
  /** m²: the rooms' areas that are known; null when none is. */
  total: number | null;
}

export interface RoomSchedule {
  levels: RoomScheduleLevel[];
  /** m², over every room: the building's useful area, what Au sums. Null when no room has an area. */
  total: number | null;
  rooms: number;
  /** Rooms whose area is the footprint of their geometry, because the model states none. */
  fromGeometry: number;
  /** Rooms with no area at all (counted in the list, not in a total). */
  withoutArea: number;
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

const sum = (rooms: readonly RoomRecord[]): number | null => {
  let total: number | null = null;
  for (const r of rooms) if (r.area !== null && Number.isFinite(r.area)) total = (total ?? 0) + r.area;
  return total;
};

/** The schedule of `rooms` over `levels`: levels low to high (unknown elevation last, then rooms on none), rooms by number then name. */
export function roomSchedule(levels: readonly ScheduleLevelInfo[], rooms: readonly RoomRecord[]): RoomSchedule {
  const order = levels.map((l, i) => i).sort((a, b) => (levels[a].elevation ?? Infinity) - (levels[b].elevation ?? Infinity) || a - b);
  const byRoom = (a: RoomRecord, b: RoomRecord) => collator.compare(a.number, b.number) || collator.compare(a.name, b.name);
  const held = (index: number | null) => rooms.filter((r) => r.level === index).sort(byRoom);
  const groups: RoomScheduleLevel[] = [
    ...order.map((i): RoomScheduleLevel => ({ name: levels[i].name, rooms: held(i), total: null })),
    { name: '', rooms: held(null), total: null },
  ].filter((g) => g.rooms.length > 0).map((g) => ({ ...g, total: sum(g.rooms) }));
  return {
    levels: groups,
    total: sum(rooms),
    rooms: rooms.length,
    fromGeometry: rooms.filter((r) => r.source === 'geometry').length,
    withoutArea: rooms.filter((r) => r.area === null).length,
  };
}

export interface RoomScheduleWords {
  number: string;
  room: string;
  level: string;
  area: string;
  /** The heading of the perimeter column (metres). */
  perimeter: string;
  /** "Total {level}" and the building's, as the table's total rows say them. */
  levelTotal: (level: string) => string;
  total: string;
  /** The column saying where an area comes from, and its two answers: the model's quantity, or the footprint of the geometry. */
  source: string;
  quantity: string;
  geometry: string;
  noLevel: string;
}

export const ROOM_SCHEDULE_EN: RoomScheduleWords = {
  number: 'No.', room: 'Room', level: 'Level', area: 'Useful area m²', perimeter: 'Perimeter m', levelTotal: (l) => `Total ${l}`, total: 'Total building (Au)',
  source: 'Source', quantity: 'model quantity', geometry: 'geometry', noLevel: 'No level',
};

/** Romanian, with the terms of `ro-glossary.md` (the app prints the same words). */
export const ROOM_SCHEDULE_RO: RoomScheduleWords = {
  number: 'Nr.', room: 'Încăpere', level: 'Nivel', area: 'Arie utilă m²', perimeter: 'Perimetru m', levelTotal: (l) => `Total ${l}`, total: 'Total clădire (Au)',
  source: 'Sursă', quantity: 'cantitate din model', geometry: 'geometrie', noLevel: 'Fără nivel',
};

export const roomScheduleWords = (locale: string): RoomScheduleWords => (/^ro\b/i.test(locale) ? ROOM_SCHEDULE_RO : ROOM_SCHEDULE_EN);

/** One printed line of the table. `kind` says what it is; `area` is null where none is known. */
export interface RoomScheduleLine {
  kind: 'room' | 'levelTotal' | 'total';
  number: string;
  name: string;
  level: string;
  area: number | null;
  /** Metres; null for a total and for a room without geometry. */
  perimeter: number | null;
  source: AreaSource | null;
}

/** The table's lines in print order: each level's rooms then its total, then the building's. */
export function roomScheduleLines(schedule: RoomSchedule, words: RoomScheduleWords): RoomScheduleLine[] {
  const out: RoomScheduleLine[] = [];
  for (const level of schedule.levels) {
    const name = level.name || words.noLevel;
    for (const r of level.rooms) out.push({ kind: 'room', number: r.number, name: r.name, level: name, area: r.area, perimeter: r.perimeter, source: r.source });
    out.push({ kind: 'levelTotal', number: '', name: words.levelTotal(name), level: name, area: level.total, perimeter: null, source: null });
  }
  out.push({ kind: 'total', number: '', name: words.total, level: '', area: schedule.total, perimeter: null, source: null });
  return out;
}

const NONE = '–';
const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

/** The table as cells of text, the header row first: number, room, level, area, perimeter (figures written for `locale`, `–` for a room with none). What the text, and a sheet that prints the schedule, are made of. */
export function roomScheduleRows(schedule: RoomSchedule, locale: SheetLocale = 'en'): string[][] {
  const words = roomScheduleWords(languageOf(locale));
  return [[words.number, words.room, words.level, words.area, words.perimeter], ...roomScheduleLines(schedule, words).map((l) => [l.number, l.name, l.kind === 'room' ? l.level : '', l.area === null ? NONE : sheetNumber(locale, l.area, 2, { kind: 'area' }), l.kind !== 'room' ? '' : l.perimeter === null ? NONE : sheetNumber(locale, l.perimeter, 2, { kind: 'length' })])];
}

/** The table as aligned text, areas written in `locale` ("12,50" in Romanian). */
export function roomScheduleText(schedule: RoomSchedule, locale: SheetLocale = 'en'): string {
  const rows = roomScheduleRows(schedule, locale);
  const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => [...r[c]].length)));
  const pad = (text: string, c: number) => (c >= 3 ? text.padStart(widths[c]) : text.padEnd(widths[c]));
  return rows.map((r) => r.map((text, c) => pad(text, c)).join('  ').trimEnd()).join('\n');
}

/** The table as CSV: plain numbers (a machine reads them), a column saying where each area comes from, model text escaped by the one CSV escaper (`@ifc-lite/export`). */
export function roomScheduleCsv(schedule: RoomSchedule, locale: SheetLocale = 'en'): string {
  const words = roomScheduleWords(languageOf(locale));
  const lines = roomScheduleLines(schedule, words).map((l) => [l.number, l.name, l.kind === 'room' ? l.level : '', l.area === null ? '' : String(round6(l.area)), l.perimeter === null ? '' : String(round6(l.perimeter)), l.source === 'quantity' ? words.quantity : l.source === 'geometry' ? words.geometry : '']);
  return [[words.number, words.room, words.level, words.area, words.perimeter, words.source], ...lines].map((r) => r.map((v) => escapeCsvCell(v)).join(',')).join('\n');
}

/**
 * The table as an `ExportTable` for the one CSV and XLSX writer (`schedule-csv.ts`): the rows the sheet prints, level headings
 * and totals in bold, the areas and perimeters as numbers (never text) with their kinds, so the XLSX gives them the project's
 * decimals (#88).
 */
export function roomScheduleTable(schedule: RoomSchedule, words: RoomScheduleWords, notes: readonly string[] = []): ExportTable {
  const rows: ExportCell[][] = [];
  const bold: number[] = [];
  roomScheduleLines(schedule, words).forEach((l, i, lines) => {
    if (l.kind === 'room' && lines[i - 1]?.kind !== 'room') { bold.push(rows.length); rows.push(['', l.level, '', null, null]); }
    if (l.kind !== 'room') bold.push(rows.length);
    rows.push([l.number, l.name, l.kind === 'room' ? l.level : '', l.area === null ? null : round6(l.area), l.perimeter === null ? null : round6(l.perimeter)]);
  });
  return { name: words.room, header: [words.number, words.room, words.level, words.area, words.perimeter], rows, bold, numeric: [3, 4], kinds: { 3: 'area', 4: 'length' }, notes };
}
