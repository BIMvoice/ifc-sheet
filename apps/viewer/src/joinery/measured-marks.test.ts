/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Measured figures marked (#74): on the takeoff sheet and the quantities by
 * type a figure with any part measured from geometry carries a `*`, the note
 * under the table says what it means and how many figures could not be
 * measured, and the CSV gains a column naming them. A table whose figures are
 * all declared is exactly as before.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { typeQuantities, type TypeElement } from '@bimvoice/ifcsheet';
import { layoutTypeQuantities, typeQuantityTable, type TypeQuantityLabels } from '@bimvoice/ifcsheet';
import type { ScheduleLayout } from './schedule-layout';
import { takeoffRows, type TakeoffElement, layoutMaterialTakeoff, takeoffTable } from '@bimvoice/ifcsheet';

const measured = { note: 'NOTE', unmeasured: (n: number) => `UNMEASURED ${n}`, column: 'Measured', volume: 'volume', area: 'area' };
const TAKEOFF = { locale: 'en' as const, title: 'Materials', material: 'Material', elements: 'Elements', volume: 'Volume', area: 'Area', usedIn: 'Used in', total: 'Total', measured };
const TYPES: TypeQuantityLabels = {
  locale: 'en', title: 'Types', type: 'Type', class: 'Class', level: 'Level', count: 'Count', length: 'Length', area: 'Area', volume: 'Volume', noQto: 'No Qto',
  total: 'Total', noType: '(no type)', noLevel: 'No level', classification: 'Code', classificationTitle: 'Title', unclassified: 'Unclassified', measured,
};
const texts = (l: ScheduleLayout) => l.prims.flatMap((p) => (p.kind === 'text' ? [p.text] : []));

describe('the takeoff marks measured figures (#74)', () => {
  const elements: TakeoffElement[] = [
    { className: 'IfcWall', materials: [{ name: 'Brick', share: 1 }], volume: 4, area: 10, volumeSource: 'measured', areaSource: 'declared' },
    { className: 'IfcSlab', materials: [{ name: 'Concrete', share: 1 }], volume: 12, area: 40, volumeSource: 'declared', areaSource: 'declared' },
    { className: 'IfcRailing', materials: [{ name: 'Steel', share: 1 }], volume: null, area: null, volumeSource: null, areaSource: null, volumeRefusal: 'notClosed' },
  ];
  const rows = takeoffRows(elements);

  it('marks a measured volume, not the declared area beside it nor another material, and the total it is in', () => {
    const t = texts(layoutMaterialTakeoff(rows, TAKEOFF));
    assert.ok(t.includes('4.00 *'), t.join('|'));
    assert.ok(t.includes('10.00') && t.includes('12.00') && t.includes('40.00'));
    assert.ok(t.includes('16.00 *'), 'the total includes a measured figure');
    assert.ok(t.includes('NOTE'));
    assert.ok(t.includes('UNMEASURED 1'), 'the open railing is counted');
  });

  it('names the measured figures in a CSV column', () => {
    const table = takeoffTable(rows, TAKEOFF);
    assert.equal(table.header.at(-1), 'Measured');
    const brick = table.rows.find((r) => r[0] === 'Brick')!;
    assert.equal(brick.at(-1), 'volume');
    assert.equal(brick[2], 4, 'the figure stays a number');
    assert.equal(table.rows.find((r) => r[0] === 'Concrete')!.at(-1), null);
  });

  it('prints an all-declared takeoff as before: no mark, no note, no column', () => {
    const declared = takeoffRows(elements.slice(1, 2));
    const t = texts(layoutMaterialTakeoff(declared, TAKEOFF));
    assert.ok(!t.some((x) => x.endsWith(' *') || x === 'NOTE'));
    assert.deepEqual(takeoffTable(declared, TAKEOFF).header, ['Material', 'Elements', 'Volume', 'Area', 'Used in']);
  });
});

describe('the quantities by type mark measured figures (#74)', () => {
  const base = { typeClass: 'IfcWallType', typeName: 'W1', level: 'L0', elevation: 0, length: null } as const;
  const elements: TypeElement[] = [
    { ...base, className: 'IfcWall', area: 15, volume: 4.5, areaSource: 'measured', volumeSource: 'measured' },
    { ...base, className: 'IfcWall', typeName: 'W2', area: 8, volume: 2, areaSource: 'declared', volumeSource: 'declared' },
  ];
  const data = typeQuantities(elements);

  it('marks the measured type\'s figures and the class total, not the declared type', () => {
    const t = texts(layoutTypeQuantities(data, TYPES));
    assert.ok(t.includes('15.00 *') && t.includes('4.50 *'), t.join('|'));
    assert.ok(t.includes('8.00') && t.includes('2.00'));
    assert.ok(t.includes('23.00 *') && t.includes('6.50 *'), 'the class total');
    assert.ok(t.includes('NOTE'));
    assert.ok(!t.some((x) => x.startsWith('UNMEASURED')), 'nothing refused, no count');
  });

  it('names the measured figures in a CSV column', () => {
    const table = typeQuantityTable(data, TYPES);
    assert.equal(table.header.at(-1), 'Measured');
    assert.equal(table.rows.find((r) => r[0] === 'W1')!.at(-1), 'volume, area');
    assert.equal(table.rows.find((r) => r[0] === 'W2')!.at(-1), null);
  });

  it('prints an all-declared table as before', () => {
    const declared = typeQuantities(elements.slice(1));
    assert.ok(!texts(layoutTypeQuantities(declared, TYPES)).some((x) => x.endsWith(' *') || x === 'NOTE'));
    assert.equal(typeQuantityTable(declared, TYPES).header.at(-1), 'No Qto');
  });
});
