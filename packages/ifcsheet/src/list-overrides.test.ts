/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, expect, it } from 'vitest';
import { clearListOverride, listColumnKey, orphanedOverrides, readListOverrides, setListOverride, withListOverrides } from './list-overrides.js';
import { readListScheduleDef, type ListScheduleColumn, type ListTableSource } from './list-schedule.js';

const NAME: ListScheduleColumn = { id: 'name', source: 'attribute', propertyName: 'Name' };
const U: ListScheduleColumn = { id: 'u', source: 'property', psetName: 'Pset_DoorCommon', propertyName: 'ThermalTransmittance' };
const SOURCE: ListTableSource = {
  columns: [{ id: 'name', label: 'Name', numeric: false }, { id: 'u', label: 'U', numeric: true }],
  rows: [['A', 1.1], ['B', 2.2]], totals: null,
};

describe('typed cell values (#446)', () => {
  it('are keyed by the element and the property, and replace the cell of that element only', () => {
    const overrides = setListOverride(undefined, 'GB', listColumnKey(U), '0,8', 'B');
    const out = withListOverrides(SOURCE, { columns: [NAME, U], overrides }, ['GA', 'GB']);
    expect(out.rows).toEqual([['A', 1.1], ['B', 0.8]]);
    expect(out.overridden).toEqual([[], [1]]);
    expect(out.guids).toEqual(['GA', 'GB']);
    // The same rows in another order: the value stays with its element.
    const moved = withListOverrides({ ...SOURCE, rows: [['B', 2.2], ['A', 1.1]] }, { columns: [NAME, U], overrides }, ['GB', 'GA']);
    expect(moved.rows).toEqual([['B', 0.8], ['A', 1.1]]);
  });

  it('follow their property when the columns are reordered, and a figure column keeps text that is not a number as text', () => {
    const overrides = setListOverride(setListOverride(undefined, 'GA', listColumnKey(U), 'n/a', 'A'), 'GA', listColumnKey(NAME), 'Door A', 'A');
    const swapped: ListTableSource = { ...SOURCE, columns: [SOURCE.columns[1], SOURCE.columns[0]], rows: [[1.1, 'A'], [2.2, 'B']] };
    expect(withListOverrides(swapped, { columns: [U, NAME], overrides }, ['GA', 'GB']).rows[0]).toEqual(['n/a', 'Door A']);
  });

  it('leave a grouped list, or rows with no ids, alone', () => {
    const overrides = setListOverride(undefined, 'GA', listColumnKey(NAME), 'x', 'A');
    expect(withListOverrides(SOURCE, { columns: [NAME, U], groupBy: ['name'], overrides }, ['GA', 'GB'])).toBe(SOURCE);
    expect(withListOverrides(SOURCE, { columns: [NAME, U], overrides }, undefined)).toBe(SOURCE);
    expect(withListOverrides(SOURCE, { columns: [NAME, U], overrides }, ['GA'])).toBe(SOURCE);
  });

  it('are read back from a file, damaged ones dropped and a repeat of a cell kept once', () => {
    const def = readListScheduleDef({ columns: [NAME], overrides: [
      { guid: 'GA', key: 'attribute::Name', value: 'one', about: 'A' }, { guid: 'GA', key: 'attribute::Name', value: 'two' },
      { guid: '', key: 'k', value: 'v' }, { guid: 'GB', key: 'k' }, 7,
    ] });
    expect(def.overrides).toEqual([{ guid: 'GA', key: 'attribute::Name', value: 'two', about: '' }]);
    expect(readListOverrides([])).toBeUndefined();
    expect(readListScheduleDef({ columns: [NAME] }).overrides).toBeUndefined();
  });

  it('are reset by clearing the cell, and the elements that are gone are listed once each', () => {
    let o = setListOverride(undefined, 'GA', 'k1', 'x', 'A');
    o = setListOverride(o, 'GA', 'k2', 'y', 'A');
    o = setListOverride(o, 'GB', 'k1', 'z', 'B');
    expect(clearListOverride(o, 'GA', 'k1').map((c) => `${c.guid}:${c.key}`)).toEqual(['GA:k2', 'GB:k1']);
    expect(orphanedOverrides(o, (g) => g === 'GB')).toEqual([{ guid: 'GA', about: 'A', count: 2 }]);
  });
});
