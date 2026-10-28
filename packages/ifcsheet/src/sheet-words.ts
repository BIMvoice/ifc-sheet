/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The words the room schedule's notes and area summary, the drawing register's headings and the "as indicated" scale are printed
 * with on a sheet (#479), English and Romanian, under the keys of the app's catalogues. The app says them through its own
 * translation (`t`), `ifcsheet build` through `sheetSayFor`; a test in the app compares the two, so a sheet and its PDF cannot
 * word a table differently. The labels are built here for both (`roomScheduleLabelsOf`, `registerLabelsOf`).
 */

import type { RegisterLabels } from './register-layout.js';
import type { RoomSchedule, RoomScheduleWords } from './room-schedule.js';
import type { RoomScheduleLabels } from './room-schedule-layout.js';
import type { RoomSummaryWords } from './room-summary-layout.js';
import { fillTemplate } from './boq-words.js';
import { sheetLevel } from './sheet-number.js';
import type { SheetLocale } from './units-and-numbers.js';
import type { AreaSummary } from './urban-area-summary.js';

export const SHEET_WORDS_EN = {
  'roomSched.note.source': 'Area: the model\'s NetFloorArea, else GrossFloorArea (Qto_SpaceBaseQuantities, else any quantity set). The building total is Au on the urban indicators sheet: the same rooms, the same areas.',
  'roomSched.note.geometry': '* Estimated area: the model states no NetFloorArea or GrossFloorArea for this room, so the footprint of its geometry is used ({count} rooms).',
  'roomSched.note.none': '{count} rooms have no area (the model states none and they have no geometry); they are listed and not in the totals.',
  'roomSched.note.leftOut': 'Left out: {external} external (balconies, terraces), {gfa} area-scheme (GFA), {parents} split into rooms of their own.',
  'roomSum.note.perimeter': 'Perimeter: the outline of the footprint of the room\'s geometry, the one its area falls back on; – where the room has no geometry. The model\'s own Perimeter quantity is not read.',
  'roomSum.heading': 'Area summary (Su, Sc, Sd)',
  'roomSum.level': 'Level',
  'roomSum.su': 'Su m²',
  'roomSum.sc': 'Sc m²',
  'roomSum.sd': 'Sd m²',
  'roomSum.building': 'Total building',
  'roomSum.note.defs': 'Su = usable area (Au): the sum of the rooms\' areas. Sc = built area (Ac): the footprint of the level containing {mark}, measured to the outer face of the external walls. Sd = gross floor area (Ad): the sum of the built areas of all levels, basements included; a level\'s line is its own built area. The same figures as the urban indicators sheet.',
  'roomSum.note.atLeast': '≥ marks a level where walls, columns or slabs gave no outline: its built area is at least that much.',
  'roomSched.noLevel': 'No level',
  'urban.atLeast': '≥ {value}',
  'issue.list.sheet': 'Sheet',
  'issue.list.sheetTitle': 'Title',
  'issue.list.scale': 'Scale',
  'issue.list.revision': 'Revision',
  'issue.list.date': 'Date',
  'sheets.asIndicated': 'As indicated',
} as const;

export type SheetWordKey = keyof typeof SHEET_WORDS_EN;

export const SHEET_WORDS_RO: Record<SheetWordKey, string> = {
  'roomSched.note.source': 'Aria: NetFloorArea din model, în lipsa ei GrossFloorArea (Qto_SpaceBaseQuantities, altfel orice set de cantități). Totalul clădirii este Au din foaia de indicatori urbanistici: aceleași încăperi, aceleași arii.',
  'roomSched.note.geometry': '* Arie estimată: modelul nu dă NetFloorArea sau GrossFloorArea pentru această încăpere, deci se ia aria amprentei geometriei ei ({count} încăperi).',
  'roomSched.note.none': '{count} încăperi nu au arie (modelul nu o dă și nu au geometrie); sunt listate și nu intră în totaluri.',
  'roomSched.note.leftOut': 'Excluse: {external} exterioare (balcoane, terase), {gfa} din schema de arii (GFA), {parents} împărțite în încăperi proprii.',
  'roomSum.note.perimeter': 'Perimetru: conturul amprentei geometriei încăperii, aceeași de la care se ia și aria când modelul nu o dă; – unde încăperea nu are geometrie. Cantitatea Perimeter din model nu este citită.',
  'roomSum.heading': 'Sinteza ariilor (Su, Sc, Sd)',
  'roomSum.level': 'Nivel',
  'roomSum.su': 'Su m²',
  'roomSum.sc': 'Sc m²',
  'roomSum.sd': 'Sd m²',
  'roomSum.building': 'Total clădire',
  'roomSum.note.defs': 'Su = aria utilă (Au): suma ariilor încăperilor. Sc = aria construită (Ac): amprenta nivelului care conține {mark}, măsurată la fața exterioară a pereților exteriori. Sd = aria desfășurată (Ad): suma ariilor construite ale tuturor nivelurilor, subsolurile incluse; linia unui nivel este aria lui construită. Aceleași cifre ca în foaia de indicatori urbanistici.',
  'roomSum.note.atLeast': '≥ marchează un nivel la care pereți, stâlpi sau planșee nu au dat contur: aria lui construită este cel puțin atât.',
  'roomSched.noLevel': 'Fără nivel',
  'urban.atLeast': '≥ {value}',
  'issue.list.sheet': 'Planșa',
  'issue.list.sheetTitle': 'Titlu',
  'issue.list.scale': 'Scara',
  'issue.list.revision': 'Revizie',
  'issue.list.date': 'Data',
  'sheets.asIndicated': 'Conform indicațiilor',
};

/** Says a word: its template with the `{name}` parameters filled in. */
export type SheetSay = (key: SheetWordKey, params?: Record<string, string | number>) => string;

/** The words of a language for the command line: Romanian for `ro`, English otherwise. */
export function sheetSayFor(language: string): SheetSay {
  const words: Record<SheetWordKey, string> = /^ro\b/i.test(language) ? SHEET_WORDS_RO : SHEET_WORDS_EN;
  return (key, params) => fillTemplate(words[key], params);
}

/** What the room schedule reads besides its rooms: how many spaces the area rule left out. */
export interface RoomScheduleData {
  schedule: RoomSchedule;
  leftOut: { external: number; gfa: number; parents: number };
}

/**
 * The room schedule's labels: `words` are its column headings (`roomScheduleWords`, or the app's translation of them), `say` the notes and the
 * summary's words, in the language of the figures `locale` writes. `summary` is the area summary under the table, once the footprints are measured.
 */
export function roomScheduleLabelsOf(
  say: SheetSay, words: RoomScheduleWords, locale: SheetLocale, title: string, data: RoomScheduleData | null, summary: AreaSummary | null = null,
): RoomScheduleLabels {
  const notes = [say('roomSched.note.source'), say('roomSum.note.perimeter')];
  if (data) {
    if (data.schedule.fromGeometry > 0) notes.push(say('roomSched.note.geometry', { count: data.schedule.fromGeometry }));
    if (data.schedule.withoutArea > 0) notes.push(say('roomSched.note.none', { count: data.schedule.withoutArea }));
    notes.push(say('roomSched.note.leftOut', data.leftOut));
  }
  const lowerBound = summary !== null && (summary.building.scAtLeast || summary.building.sdAtLeast || summary.levels.some((l) => l.atLeast));
  const summaryWords: RoomSummaryWords = {
    heading: say('roomSum.heading'), level: say('roomSum.level'), su: say('roomSum.su'), sc: say('roomSum.sc'), sd: say('roomSum.sd'),
    building: say('roomSum.building'), noLevel: say('roomSched.noLevel'), atLeast: (value) => say('urban.atLeast', { value }),
    notes: [say('roomSum.note.defs', { mark: sheetLevel(locale, 0) }), ...(lowerBound ? [say('roomSum.note.atLeast')] : [])],
  };
  return { ...words, locale, title, notes, summary: summary ? { summary, words: summaryWords } : null };
}

/** The drawing register's headings under `title`. */
export function registerLabelsOf(say: SheetSay, title: string): RegisterLabels {
  return { title, number: say('issue.list.sheet'), sheetTitle: say('issue.list.sheetTitle'), scale: say('issue.list.scale'), revision: say('issue.list.revision'), date: say('issue.list.date') };
}
