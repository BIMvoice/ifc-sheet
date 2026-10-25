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

import { sheetNumber } from './sheet-number.js';
import type { AreaSource } from './room-areas.js';

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
  number: 'No.', room: 'Room', level: 'Level', area: 'Useful area m²', levelTotal: (l) => `Total ${l}`, total: 'Total building (Au)',
  source: 'Source', quantity: 'model quantity', geometry: 'geometry', noLevel: 'No level',
};

/** Romanian, with the terms of `ro-glossary.md` (the app prints the same words). */
export const ROOM_SCHEDULE_RO: RoomScheduleWords = {
  number: 'Nr.', room: 'Încăpere', level: 'Nivel', area: 'Arie utilă m²', levelTotal: (l) => `Total ${l}`, total: 'Total clădire (Au)',
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
  source: AreaSource | null;
}

/** The table's lines in print order: each level's rooms then its total, then the building's. */
export function roomScheduleLines(schedule: RoomSchedule, words: RoomScheduleWords): RoomScheduleLine[] {
  const out: RoomScheduleLine[] = [];
  for (const level of schedule.levels) {
    const name = level.name || words.noLevel;
    for (const r of level.rooms) out.push({ kind: 'room', number: r.number, name: r.name, level: name, area: r.area, source: r.source });
    out.push({ kind: 'levelTotal', number: '', name: words.levelTotal(name), level: name, area: level.total, source: null });
  }
  out.push({ kind: 'total', number: '', name: words.total, level: '', area: schedule.total, source: null });
  return out;
}

const NONE = '–';

/** The table as aligned text, areas written in `locale` ("12,50" in Romanian). */
export function roomScheduleText(schedule: RoomSchedule, locale = 'en'): string {
  const words = roomScheduleWords(locale);
  const rows = [[words.number, words.room, words.level, words.area], ...roomScheduleLines(schedule, words).map((l) => [l.number, l.name, l.kind === 'room' ? l.level : '', l.area === null ? NONE : sheetNumber(locale, l.area)])];
  const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => [...r[c]].length)));
  const pad = (text: string, c: number) => (c === 3 ? text.padStart(widths[c]) : text.padEnd(widths[c]));
  return rows.map((r) => r.map((text, c) => pad(text, c)).join('  ').trimEnd()).join('\n');
}

const quote = (v: string): string => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);
const cell = (v: string): string => { const q = quote(v); return /[",\n\r]/.test(q) ? `"${q.replace(/"/g, '""')}"` : q; };

/** The table as CSV: plain numbers (a machine reads them), a column saying where each area comes from, model text guarded against spreadsheet formulas. */
export function roomScheduleCsv(schedule: RoomSchedule, locale = 'en'): string {
  const words = roomScheduleWords(locale);
  const lines = roomScheduleLines(schedule, words).map((l) => [l.number, l.name, l.kind === 'room' ? l.level : '', l.area === null ? '' : String(Math.round(l.area * 1e6) / 1e6), l.source === 'quantity' ? words.quantity : l.source === 'geometry' ? words.geometry : '']);
  return [[words.number, words.room, words.level, words.area, words.source], ...lines].map((r) => r.map(cell).join(',')).join('\n');
}
