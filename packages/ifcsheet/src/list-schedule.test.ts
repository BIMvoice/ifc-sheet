/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A schedule built from the Lists engine (#78): the definition the project saves (read back without trusting it), and the table a result becomes.
 * The rows themselves are the Lists engine's and are pinned where they run, against AC20-FZK-Haus (`apps/viewer/src/lib/lists/list-schedule.fzk.test.ts`).
 */

import { describe, expect, it } from 'vitest';
import { listFigureKind, listScheduleTable, readListScheduleDef, type ListScheduleDef, type ListTableSource } from './list-schedule.js';
import { readSchedule } from './sub-reports.js';

const TYPE = { id: 'attribute::Type', source: 'attribute', propertyName: 'Type', label: 'Wall type' } as const;
const AREA = { id: 'quantity:Qto_WallBaseQuantities:NetSideArea', source: 'quantity', psetName: 'Qto_WallBaseQuantities', propertyName: 'NetSideArea' } as const;

const FULL: ListScheduleDef = {
  filter: { classes: ['IfcWallStandardCase'], levels: ['Erdgeschoss'], predefined: ['STANDARD'], properties: [{ pset: 'Pset_WallCommon', name: 'IsExternal', op: 'equals', value: 'true' }] },
  columns: [TYPE, AREA, { id: 'attribute::Name', source: 'attribute', propertyName: 'Name', hidden: true }],
  groupBy: [TYPE.id], sum: [AREA.id], totals: false,
};

describe('the definition of a list schedule as the project saves it', () => {
  it('reads back what it saved, field by field', () => {
    expect(readListScheduleDef(JSON.parse(JSON.stringify(FULL)))).toEqual(FULL);
  });

  it('drops what is damaged and keeps the rest: a column without a name, a repeated id, a group or sum naming no column', () => {
    const def = readListScheduleDef({
      columns: [TYPE, { id: 'x', source: 'attribute' }, { ...TYPE, label: 'again' }, { id: 'y', source: 'nowhere', propertyName: 'Name' }, 'text', AREA],
      groupBy: ['nope', TYPE.id, TYPE.id], sum: [AREA.id, 'nope'],
    });
    expect(def.columns.map((c) => c.id)).toEqual([TYPE.id, AREA.id]);
    expect(def.columns[0].label).toBe('Wall type');
    expect(def.groupBy).toEqual([TYPE.id]);
    expect(def.sum).toEqual([AREA.id]);
  });

  it('keeps no sum for a list that groups nothing, and no joinery dimension in the filter', () => {
    const def = readListScheduleDef({ columns: [TYPE, AREA], sum: [AREA.id], filter: { kinds: ['door'], types: ['t1'], classes: ['IfcWall'] } });
    expect(def.sum).toBeUndefined();
    expect(def.filter).toEqual({ classes: ['IfcWall'] });
  });

  it('reads anything that is not a definition as a list with no columns', () => {
    for (const raw of [undefined, null, 7, 'x', [], {}]) expect(readListScheduleDef(raw)).toEqual({ columns: [] });
  });

  it('is part of the schedule, only for the list kind; a schedule saved before it loads as it did', () => {
    const saved = readSchedule({ id: 's', name: 'Walls', kind: 'list', createdAt: 3, list: FULL });
    expect(saved?.kind).toBe('list');
    expect(saved?.list).toEqual(FULL);
    expect(readSchedule({ id: 's', name: 'Doors', kind: 'door', createdAt: 3, list: FULL })).toEqual({ id: 's', name: 'Doors', kind: 'door', createdAt: 3 });
    expect(readSchedule({ id: 's', name: 'Old', createdAt: 3 })).toEqual({ id: 's', name: 'Old', kind: 'all', createdAt: 3 });
  });
});

describe('the table of a result', () => {
  const source: ListTableSource = {
    columns: [
      { id: TYPE.id, label: 'Wall type', numeric: false },
      { id: '__count', label: 'Count', numeric: true, kind: 'count' },
      { id: AREA.id, label: 'NetSideArea (m²)', numeric: true, kind: 'area' },
      { id: 'attribute::Name', label: 'Name', numeric: false },
    ],
    rows: [['W 240', 2, 0.1 + 0.2, true], ['W 300', 11, 100, null]],
    totals: ['Total', 13, 100.3, null],
  };
  const words = { yes: 'Yes', no: 'No' };

  it('has the columns in order, a row per result row and the totals row last and bold, figures without float noise', () => {
    const table = listScheduleTable(source, { columns: [TYPE, AREA] }, 'Walls by type', words);
    expect(table.name).toBe('Walls by type');
    expect(table.header).toEqual(['Wall type', 'Count', 'NetSideArea (m²)', 'Name']);
    expect(table.rows).toEqual([['W 240', 2, 0.3, 'Yes'], ['W 300', 11, 100, null], ['Total', 13, 100.3, null]]);
    expect(table.bold).toEqual([2]);
    expect(table.numeric).toEqual([1, 2]);
    expect(table.kinds).toEqual({ 1: 'count', 2: 'area' });
  });

  it('leaves a hidden column out of the header, the rows, the totals and the kinds', () => {
    const table = listScheduleTable(source, { columns: [TYPE, { ...AREA, hidden: true }] }, 'Walls', words);
    expect(table.header).toEqual(['Wall type', 'Count', 'Name']);
    expect(table.rows[2]).toEqual(['Total', 13, null]);
    expect(table.kinds).toEqual({ 1: 'count' });
  });

  it('has no totals row when the result has none', () => {
    const table = listScheduleTable({ ...source, totals: null }, { columns: [] }, 'Walls', words);
    expect(table.rows).toHaveLength(2);
    expect(table.bold).toEqual([]);
  });

  it('names what a quantity measures from its type, and nothing for weight, time or none', () => {
    expect([0, 1, 2, 3, 6].map(listFigureKind)).toEqual(['length', 'area', 'volume', 'count', 'count']);
    expect([4, 5, undefined, 99].map(listFigureKind)).toEqual([undefined, undefined, undefined, undefined]);
  });
});
