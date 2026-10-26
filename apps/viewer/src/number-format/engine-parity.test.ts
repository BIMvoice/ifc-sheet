/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The sheet and the command line write the same figures for the same project (#88), as the title block does (`TitleBlockRo.test.tsx`).
 * The screen side is the app's own layouts (`layoutBoq`, `layoutListSchedule`, `roomScheduleCells`: what the Wall draws and the DXF
 * writes); the engine side is what `ifcsheet boq`, `list` and `rooms` print (`boqLineText`, `listTableText`, `roomScheduleText`). Both are
 * given one project format: the English interface with a comma, and values big enough to be grouped ("1.234,50"). The engine draws no
 * dimension or level mark, so those figures have no engine side.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROOM_SCHEDULE_EN, boqLineText, boqSayFor, computeBoq, listTableText, newArticle, roomSchedule, roomScheduleText, sheetFormat,
  type BoqElement, type ListScheduleTable, type RoomRecord,
} from '@bimvoice/ifcsheet';
import { layoutBoq } from '@/joinery/boq-layout';
import { layoutListSchedule } from '@/joinery/list-schedule-layout';
import { roomScheduleCells } from '@/joinery/room-schedule-layout';
import type { SchedulePrim } from '@/joinery/schedule-layout';

/** What the project sets (the Romanian pack's separator) on the English interface, and the unset project. */
const COMMA = sheetFormat('en', { separator: 'comma' });
const NONE = sheetFormat('en', undefined);

/** The figures of a text: every number with its separators. */
const figures = (text: string): string[] => text.match(/\d[\d.,]*\d|\d/g) ?? [];
const printed = (prims: readonly SchedulePrim[]): string[] => prims.flatMap((p) => (p.kind === 'text' ? [p.text] : []));

const wall = (n: number, area: number): BoqElement => ({
  modelId: 'm', expressId: n, globalId: `G${n}`, name: `Wall ${n}`, ifcClass: 'IfcWallStandardCase', predefinedType: null, typeClass: 'IfcWallType', typeName: 'T240',
  level: 'Ground', materials: [], properties: [], quantities: [{ name: 'NetSideArea', dimension: 'area', value: area }],
});

describe('the sheet and the command line write the same figures', () => {
  it('bill of quantities: the total of an article', () => {
    const result = computeBoq([wall(1, 1000.125), wall(2, 234.375)], [{ ...newArticle('a', 'm2'), code: 'W1', description: 'Walls', quantity: 'NetSideArea', typeName: 'T240' }]);
    for (const [format, total] of [[COMMA, '1.234,50'], [NONE, '1,234.50']] as const) {
      const sheet = printed(layoutBoq(result, { locale: format, title: 'BOQ', say: boqSayFor('en'), detail: false }).prims);
      const engine = boqLineText(result.lines[0], format);
      assert.ok(sheet.includes(total), `the sheet prints ${total}: ${sheet.join(' | ')}`);
      assert.ok(engine.includes(` ${total} m²`), `the command line prints ${total}: ${engine}`);
    }
  });

  it('list schedule: every figure of every row, grouped and totalled', () => {
    const table: ListScheduleTable = {
      name: 'Walls', header: ['Type', 'Count', 'Area (m²)', 'Height (m)'], bold: [2], numeric: [1, 2, 3], kinds: { 1: 'count', 2: 'area', 3: 'length' },
      rows: [['Thick', 5, 1234.5678, 2.705], ['Thin', 8, 99.999, 3], ['Total', 13, 1334.5668, null]],
    };
    const sheet = printed(layoutListSchedule(table, { locale: COMMA, title: 'Walls' }).prims);
    const engine = figures(listTableText(table, COMMA));
    assert.deepEqual(engine, ['5', '1.234,57', '2,71', '8', '100,00', '3,00', '13', '1.334,57']);
    for (const f of engine) assert.ok(sheet.includes(f), `the sheet prints ${f}: ${sheet.join(' | ')}`);
    assert.ok(!/\d\.\d/.test(listTableText(table, COMMA).replace(/\d\.\d{3}(?=,)/g, '')), 'no point decimal on the command line');
  });

  it('room schedule: areas and perimeters, per room and per level', () => {
    const rooms: RoomRecord[] = [
      { id: 'a', number: '1', name: 'Hall', level: 0, area: 1234.5678, source: 'quantity', perimeter: 14.16 },
      { id: 'b', number: '2', name: 'Office', level: 0, area: 12.6, source: 'quantity', perimeter: 14.4 },
    ];
    const schedule = roomSchedule([{ name: 'EG', elevation: 0 }], rooms);
    const sheet = roomScheduleCells(schedule, { ...ROOM_SCHEDULE_EN, locale: COMMA }).flatMap((r) => r.cells);
    const engine = figures(roomScheduleText(schedule, COMMA));
    assert.ok(engine.includes('1.234,57') && engine.includes('14,16'), `the command line prints the comma: ${engine.join(' ')}`);
    for (const f of engine) assert.ok(sheet.some((c) => c.replace(/ \*$/, '') === f), `the sheet prints ${f}: ${sheet.join(' | ')}`);
  });
});
