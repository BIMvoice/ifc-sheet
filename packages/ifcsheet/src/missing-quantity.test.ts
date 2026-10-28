/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A quantity that is absent prints as a dash, never 0 (#411), in the list (the export model, the sheet's table, the command line's text),
 * the PDF/text export and the bill of quantities, which sum it by the one rule (`SumTally` of `@ifc-lite/lists`). A declared 0 prints 0.
 */

import { describe, expect, it } from 'vitest';
import type { ColumnDefinition, ListRow } from '@ifc-lite/lists';
import { newArticle } from './boq.js';
import { computeBoq, type BoqElement } from './boq-compute.js';
import { listTableCells, listTableText } from './list-figures.js';
import { buildExportModel, displaySum, totalsRowText } from './list-export-model.js';
import { listScheduleTable, type ListScheduleTable } from './list-schedule.js';
import { listTableSourceOf as sourceOf } from './list-schedule-run.js';

const columns: ColumnDefinition[] = [
  { id: 'type', source: 'attribute', propertyName: 'Type' } as ColumnDefinition,
  { id: 'area', source: 'quantity', propertyName: 'NetSideArea' } as ColumnDefinition,
];
const row = (id: number, type: string, area: number | null): ListRow => ({ entityId: id, modelId: 'm', values: [type, area] });

/** The table the sheet and `ifcsheet list` print for these rows: the export model, its pivot, the same steps as the run. */
function tableOf(rows: ListRow[]): ListScheduleTable {
  const model = buildExportModel({
    title: 't', columns, rows, numericCols: [false, true], columnWidths: [100, 100], generatedAt: '',
    grouping: { columnId: 'type', columnIds: ['type'], sumColumnIds: ['area'], view: 'schedule' } as never,
  });
  const source = sourceOf({ model, columns, result: {} } as never, {}, { count: 'Count', total: 'Total', missing: '' });
  return listScheduleTable(source, { columns: [] }, 'Walls', { yes: 'Yes', no: 'No' });
}

describe('a missing quantity in the list', () => {
  const table = tableOf([row(1, 'A', null), row(2, 'A', null), row(3, 'B', 0), row(4, 'C', 2.5), row(5, 'C', null)]);
  const cells = listTableCells(table, 'en');
  const line = (label: string) => cells.find((r) => r[0] === label)!;

  it('prints a dash for a group none of whose rows states it', () => {
    expect(line('A')).toEqual(['A', '2', '–']);
  });

  it('prints a declared 0 as 0', () => {
    expect(line('B')[2]).toBe('0');
  });

  it('sums the stated rows of a partly stated group and the total over them', () => {
    expect(line('C')[2]).toBe('2.5');
    expect(line('Total')[2]).toBe('2.5');
  });

  it('prints the dash in the text of `ifcsheet list`, and the total of nothing stated as a dash too', () => {
    expect(listTableText(table, 'en')).toContain('–');
    const none = listTableText(tableOf([row(1, 'A', null), row(2, 'A', null)]), 'en');
    expect(none).toMatch(/A\s+2\s+–\n/);
    expect(none).toMatch(/Total\s+2\s+–\n$/);
    expect(none).not.toMatch(/\b0\b.*\n$/);
  });

  it('prints the dash in the text exports (PDF, document table) and leaves a CSV or XLSX cell empty', () => {
    const model = buildExportModel({
      title: 't', columns, rows: [row(1, 'A', null)], numericCols: [false, true], columnWidths: [100, 100], generatedAt: '',
      grouping: { columnId: 'type', columnIds: ['type'], sumColumnIds: ['area'] } as never,
    });
    expect(model.groups![0].sums.area).toBeNull();
    expect(displaySum(model.groups![0].sums.area)).toBe('–');
    expect(totalsRowText(model, model.columns, 'Total (1)')).toEqual(['Total (1)', '–']);
    expect(displaySum(0)).toBe('0');
  });
});

describe('the list and the bill of quantities agree', () => {
  const wall = (volume: number | undefined, n: number): BoqElement => ({
    modelId: 'm', expressId: n, globalId: `G${n}`, name: `W${n}`, ifcClass: 'IfcWall', predefinedType: null, typeClass: null, typeName: null,
    level: '', materials: [], properties: [],
    quantities: volume === undefined ? [] : [{ name: 'NetVolume', dimension: 'volume', value: volume }],
  });
  const article = { ...newArticle('a', 'm3'), code: 'EXAMPLE-01', quantity: 'NetVolume', filter: { classes: ['IfcWall'] } };
  const boqTotal = (vs: (number | undefined)[]) => computeBoq(vs.map((v, i) => wall(v, i + 1)), [article]).lines[0].total;
  const listTotal = (vs: (number | undefined)[]) => tableOf(vs.map((v, i) => row(i + 1, 'A', v ?? null))).rows.at(-1)![2];

  it.each([[[undefined, undefined]], [[0, undefined]], [[0]], [[1.5, undefined, 2]]])('gives the same total for %j', (vs) => {
    expect(listTotal(vs)).toEqual(boqTotal(vs));
  });
});
