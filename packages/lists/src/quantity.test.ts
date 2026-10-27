/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** "A quantity, or missing" (#411): a sum over rows that state nothing is missing (null), a declared 0 is 0, and a part that states some is the sum of those. */

import { describe, expect, it } from 'vitest';
import { summariseListRows } from './engine.js';
import { compareQuantities, emptyTally, quantityText, tallyPart, tallyTotal, tallyValue } from './quantity.js';
import type { ColumnDefinition, ListDefinition, ListRow } from './types.js';

const columns: ColumnDefinition[] = [
  { id: 'type', source: 'attribute', propertyName: 'Type' },
  { id: 'area', source: 'quantity', propertyName: 'NetSideArea' },
];
const definition = { columns, grouping: { columnId: 'type', columnIds: ['type'], sumColumnIds: ['area'] } } as unknown as ListDefinition;
const row = (id: number, type: string, area: unknown): ListRow => ({ entityId: id, modelId: 'm', values: [type, area as never] });

describe('the sum of a quantity that rows may not state', () => {
  it('is missing (null), not 0, over rows none of which states it', () => {
    const t = emptyTally();
    for (const v of [null, undefined, '', 'text', NaN]) tallyValue(t, v);
    expect(tallyTotal(t)).toBeNull();
  });

  it('is 0 for a declared 0, and adds the stated rows only', () => {
    const zero = emptyTally();
    tallyValue(zero, 0);
    expect(tallyTotal(zero)).toBe(0);
    const some = emptyTally();
    for (const v of [null, 2, 0, 3.5]) tallyValue(some, v);
    expect(tallyTotal(some)).toBe(5.5);
    const parts = emptyTally();
    tallyPart(parts, null);
    expect(tallyTotal(parts)).toBeNull();
    tallyPart(parts, 0);
    expect(tallyTotal(parts)).toBe(0);
  });

  it('is written as a dash when missing and by the formatter otherwise', () => {
    expect(quantityText(null, String)).toBe('–');
    expect(quantityText(undefined, String)).toBe('–');
    expect(quantityText(0, (n) => n.toFixed(2))).toBe('0.00');
  });

  it('sorts a missing quantity before every stated one, a declared 0 included', () => {
    expect([0, null, -1].sort(compareQuantities)).toEqual([null, -1, 0]);
  });

  it('is what the engine reports: a group and the total of rows that never state it are null, a declared 0 stays 0', () => {
    const rows = [row(1, 'A', null), row(2, 'A', undefined), row(3, 'B', 0), row(4, 'C', 2), row(5, 'C', null)];
    const { groups, summary } = summariseListRows(definition, rows);
    const byLabel = Object.fromEntries(groups!.map((g) => [g.label, g.sums.area]));
    expect(byLabel).toEqual({ A: null, B: 0, C: 2 });
    expect(summary!.sums.area).toBe(2);
    expect(summariseListRows(definition, [row(1, 'A', null)]).summary!.sums.area).toBeNull();
  });
});
