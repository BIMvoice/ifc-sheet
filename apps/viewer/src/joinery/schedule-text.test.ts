/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #186, section 4: text cells on a joinery schedule, as the layout prints them. A text row is a row of every card; its cell is
 * the text keyed to the card's type, fitted to the card with the title block's measure (#220), so long text never leaves its
 * cell and the schedule still fits the paper.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultDoorSpec, defaultWindowSpec } from '@ifc-lite/create';
import { addTextRow, setTextCell, textCellText, type ScheduleTextRow } from '@bimvoice/ifcsheet';
import { layoutSchedule, scheduleCsv, scheduleMinBox, schedulePages, type ScheduleLabels, type SchedulePrim } from './schedule-layout';
import type { ScheduleData, ScheduleEntry } from './schedule-data';
import { textWidthEm } from '@/project/text-width';

const labels: ScheduleLabels = {
  locale: 'en', title: 'Joinery', mark: 'Mark', name: 'Name', size: 'Size', operation: 'Opening', sill: 'Sill', total: 'Total', uValue: 'U', fire: 'Fire', op: (op) => op,
};

function model(n: number): ScheduleData {
  return {
    levels: ['Ground'],
    entries: Array.from({ length: n }, (_, i): ScheduleEntry => {
      const door = i % 2 === 0;
      return {
        key: `t${i}`, kind: door ? 'door' : 'window', spec: door ? defaultDoorSpec(`D${i}`) : defaultWindowSpec(`W${i}`), mark: `${door ? 'D' : 'W'}${i + 1}`, name: `Type ${i}`,
        width: 0.9, height: door ? 2.1 : 1.5, counts: { Ground: 1 }, total: 1,
        occurrences: [{ modelId: 'm', expressId: i, globalId: `g${i}`, level: 'Ground', tag: null, number: 1 }],
      };
    }),
  };
}

const withText = (data: ScheduleData, rows: ScheduleTextRow[]): ScheduleData => ({ ...data, textRows: rows });
const texts = (prims: SchedulePrim[]) => prims.flatMap((p) => (p.kind === 'text' ? [p] : []));
const markX = (prims: SchedulePrim[], mark: string) => texts(prims).find((p) => p.text === mark && p.size === 4)!.x;

function manufacturer(): ScheduleTextRow[] {
  let rows = addTextRow(undefined, 'r1', 'Manufacturer');
  rows = setTextCell(rows, 'r1', 't0', 'Rehau', 'D1');
  rows = setTextCell(rows, 'r1', 't1', 'Velux', 'W2');
  return rows;
}

describe('a text row on the schedule', () => {
  it('prints its label in the label column and each type\'s text under that type\'s card', () => {
    const l = layoutSchedule(withText(model(3), manufacturer()), labels);
    const all = texts(l.prims);
    assert.ok(all.some((p) => p.text === 'Manufacturer' && p.anchor === 'start'), 'the label');
    assert.equal(all.find((p) => p.text === 'Rehau')!.x, markX(l.prims, 'D1'));
    assert.equal(all.find((p) => p.text === 'Velux')!.x, markX(l.prims, 'W2'));
    assert.equal(all.filter((p) => p.text === 'Rehau' || p.text === 'Velux').length, 2, 'a type with no text prints nothing');
  });

  it('follows the type, not the position: the same texts under the same marks when the types are listed in another order', () => {
    const data = model(4);
    const reversed = { ...data, entries: [...data.entries].reverse() };
    const a = layoutSchedule(withText(data, manufacturer()), labels).prims;
    const b = layoutSchedule(withText(reversed, manufacturer()), labels).prims;
    for (const [text, mark] of [['Rehau', 'D1'], ['Velux', 'W2']]) {
      assert.equal(texts(a).find((p) => p.text === text)!.x, markX(a, mark));
      assert.equal(texts(b).find((p) => p.text === text)!.x, markX(b, mark), `${text} under ${mark} after reordering`);
    }
  });

  it('a new type in front does not shift the text onto it', () => {
    const data = model(3);
    const extra: ScheduleEntry = { ...data.entries[0], key: 'new', mark: 'D9', name: 'New' };
    const l = layoutSchedule(withText({ ...data, entries: [extra, ...data.entries] }, manufacturer()), labels);
    assert.equal(texts(l.prims).find((p) => p.text === 'Rehau')!.x, markX(l.prims, 'D1'));
  });

  it('a schedule with no text rows is laid out exactly as before, and a row adds one row height per band', () => {
    const data = model(3);
    const plain = layoutSchedule(data, labels);
    assert.deepEqual(layoutSchedule({ ...data, textRows: undefined }, labels), plain);
    assert.deepEqual(layoutSchedule({ ...data, textRows: [] }, labels), plain);
    assert.equal(layoutSchedule(withText(data, manufacturer()), labels).height - plain.height, 6, 'one band, one row of 6 mm');
  });

  it('the page count and the smallest box count the text rows', () => {
    const data = model(40);
    const options = { scale: 50, maxWidth: 400, maxHeight: 270 };
    const rows = ['a', 'b', 'c', 'd'].reduce<ScheduleTextRow[]>((acc, id) => addTextRow(acc, id, id), []);
    assert.ok(schedulePages(withText(data, rows), options) > schedulePages(data, options), 'more rows, taller bands, more pages');
    assert.equal(scheduleMinBox(withText(data, rows), { scale: 50 }).height - scheduleMinBox(data, { scale: 50 }).height, 24);
    const pages = schedulePages(withText(data, rows), options);
    for (let page = 0; page < pages; page++) assert.ok(layoutSchedule(withText(data, rows), labels, { ...options, page }).height <= options.maxHeight + 1e-6, `page ${page} fits`);
  });
});

describe('long text still fits the paper', () => {
  const long = 'Aluminium thermal-break frame with triple glazing, powder coated RAL 7016 anthracite, delivered and fitted by the manufacturer under a ten year warranty';

  it('every printed text is no wider than its card, shrunk first and cut with an ellipsis only beyond the smallest height', () => {
    let rows = addTextRow(undefined, 'r', 'A very long row name that does not fit the label column at all');
    for (let i = 0; i < 6; i++) rows = setTextCell(rows, 'r', `t${i}`, long, '');
    const l = layoutSchedule(withText(model(6), rows), labels);
    const printed = texts(l.prims).filter((p) => p.text.startsWith('Aluminium') || p.text.startsWith('A very long'));
    assert.equal(printed.length, 7);
    for (const p of printed) {
      const width = textWidthEm(p.text, !!p.bold) * p.size;
      // A 0.9 m type at 1:50 is a 34 mm card, less 1.5 mm each side; the label column is 34 less 2 each side.
      assert.ok(width <= (p.anchor === 'start' ? 30 : 31) + 1e-6, `"${p.text}" at ${p.size} mm is ${width.toFixed(1)} mm wide`);
      assert.ok(p.size >= 2 - 1e-9, 'never below the smallest caption height');
    }
    assert.ok(printed.some((p) => p.text.endsWith('…')), 'beyond the smallest height the words are cut');
  });

  it('short text keeps the normal height', () => {
    const l = layoutSchedule(withText(model(3), manufacturer()), labels);
    assert.equal(texts(l.prims).find((p) => p.text === 'Rehau')!.size, 2.5);
  });

  it('a schedule with long text in every cell still fits the box on every page', () => {
    let rows = addTextRow(undefined, 'r', 'Remarks');
    for (let i = 0; i < 60; i++) rows = setTextCell(rows, 'r', `t${i}`, long, '');
    const data = withText(model(60), rows);
    const options = { scale: 50, maxWidth: 400, maxHeight: 270 };
    for (let page = 0; page < schedulePages(data, options); page++) {
      const l = layoutSchedule(data, labels, { ...options, page });
      assert.ok(l.width <= 400 + 1e-6 && l.height <= 270 + 1e-6, `page ${page}: ${l.width}x${l.height}`);
    }
  });
});

describe('the CSV carries the text', () => {
  it('one column per text row, each type\'s text on its line', () => {
    const csv = scheduleCsv(withText(model(3), manufacturer()), labels).trim().split('\n');
    assert.ok(csv[0].endsWith(',Manufacturer'));
    assert.ok(csv[1].endsWith(',Rehau'));
    assert.ok(csv[2].endsWith(',Velux'));
    assert.ok(csv[3].endsWith(','), 'a type with no text has an empty cell');
    assert.equal(textCellText(manufacturer()[0], 't0'), 'Rehau');
  });
});
