/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #186, section 3: whether the header cell of each type draws its elevation and its plan is the schedule's choice (`content.symbols`).
 * The elevation is the front view, the section beside it, the opening symbol and the dimensions; the plan is the plan view under it. Each
 * toggle changes exactly its own prims and the height of the cell, and nothing else of the table; a schedule that chose nothing draws
 * as it always did. The numbers are worked out from the layout's constants: at 1:20 a 1.2 x 0.2 x 1.5 m window has a front 75 mm high, a
 * plan 10 mm deep (20 mm with its gap) and a drawing area of 75 + 14 + 20 = 109 mm; without the elevation the plan alone is 14 mm.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultWindowSpec } from '@ifc-lite/create';
import type { MeshData } from '@ifc-lite/geometry';
import { layoutSchedule, type ScheduleLabels, type SchedulePrim } from './schedule-layout';
import type { ScheduleData, ScheduleEntry } from './schedule-data';
import { elementViews } from './element-views';

const labels: ScheduleLabels = {
  locale: 'en', title: 'Joinery', mark: 'Mark', name: 'Name', size: 'Size', operation: 'Opening', sill: 'Sill', total: 'Total', uValue: 'U', fire: 'Fire',
  op: (op) => op,
};

const win: ScheduleEntry = { key: 'w1', kind: 'window', spec: defaultWindowSpec('W'), mark: 'W1', name: 'W', width: 1.2, height: 1.5, counts: { Ground: 1 }, total: 1, occurrences: [] };
const withSymbols = (symbols?: { elevation?: false; plan?: false }): ScheduleData => ({ levels: ['Ground'], entries: [win], ...(symbols ? { content: { symbols } } : {}) });

function boxMesh(w: number, d: number, h: number): MeshData {
  const pts: number[] = [];
  for (const [a, b, y] of [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0], [-1, -1, h], [1, -1, h], [1, 1, h], [-1, 1, h]]) pts.push(5 + (a * w) / 2, y, 7 + (b * d) / 2);
  const indices = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  return { expressId: 1, ifcType: 'IfcWindow', positions: new Float32Array(pts), normals: new Float32Array(pts.length), indices: new Uint32Array(indices), color: [1, 1, 1, 1] } as MeshData;
}

type Layout = ReturnType<typeof layoutSchedule>;
const viewOf = (p: SchedulePrim) => (p.kind === 'path' ? p.view : undefined);
const count = (l: Layout, view: 'front' | 'plan' | 'section' | 'symbol') => l.prims.filter((p) => viewOf(p) === view).length;
/** The text prims that are not a dimension (the title, the mark and the table), by text: the title and the mark (above the cell) at their y, the rows at their distance from the bottom. */
const tableTexts = (l: Layout) => l.prims.flatMap((p) => (p.kind === 'text' && !['1200', '1500'].includes(p.text) ? [`${p.text}@${p.x}/${p.y <= 17 ? `top ${p.y}` : (l.height - p.y).toFixed(2)}`] : [])).sort();
/** Millimetres, to the float precision of the views. */
const near = (a: number, b: number, what?: string) => assert.ok(Math.abs(a - b) < 0.01, `${what ?? ''} ${a} vs ${b}`);
const dims = (l: Layout) => l.prims.flatMap((p) => (p.kind === 'text' && ['1200', '1500'].includes(p.text) ? [p.text] : [])).sort();

describe('the symbols in the header cells', () => {
  it('with no choice, or both on, the layout is the one a schedule always had', async () => {
    const views = new Map([['w1', (await elementViews([boxMesh(1.2, 0.2, 1.5)]))!]]);
    assert.deepEqual(layoutSchedule(withSymbols(), labels, { scale: 20, views }), layoutSchedule({ levels: ['Ground'], entries: [win], content: {} }, labels, { scale: 20, views }));
    const on = layoutSchedule(withSymbols(), labels, { scale: 20, views });
    assert.ok(count(on, 'front') > 0 && count(on, 'plan') > 0 && count(on, 'section') > 0 && count(on, 'symbol') > 0);
    assert.deepEqual(dims(on), ['1200', '1500']);
    near(on.height, 10 + 10 + 109 + 8 * 6, 'title, mark row, drawing area, eight rows (name, size, opening, sill, the storey, total, U, fire)');
  });

  it('plan off: only the plan view goes, and the cell is 20 mm shorter', async () => {
    const views = new Map([['w1', (await elementViews([boxMesh(1.2, 0.2, 1.5)]))!]]);
    const on = layoutSchedule(withSymbols(), labels, { scale: 20, views });
    const off = layoutSchedule(withSymbols({ plan: false }), labels, { scale: 20, views });
    assert.equal(count(off, 'plan'), 0);
    for (const v of ['front', 'section', 'symbol'] as const) assert.equal(count(off, v), count(on, v), v);
    assert.deepEqual(dims(off), ['1200', '1500']);
    near(on.height - off.height, 20);
    assert.deepEqual(tableTexts(off), tableTexts(on));
  });

  it('elevation off: the front, the section, the opening symbol and the dimensions go; the plan stays, 95 mm of cell go', async () => {
    const views = new Map([['w1', (await elementViews([boxMesh(1.2, 0.2, 1.5)]))!]]);
    const on = layoutSchedule(withSymbols(), labels, { scale: 20, views });
    const off = layoutSchedule(withSymbols({ elevation: false }), labels, { scale: 20, views });
    for (const v of ['front', 'section', 'symbol'] as const) assert.equal(count(off, v), 0, v);
    assert.equal(count(off, 'plan'), count(on, 'plan'));
    assert.deepEqual(dims(off), []);
    near(on.height - off.height, 109 - 14);
    assert.deepEqual(tableTexts(off), tableTexts(on));
    // The plan sits inside the cell, under the mark row.
    const ys = off.prims.flatMap((p) => (p.kind === 'path' && p.view === 'plan' ? p.pts.map((q) => q.y) : []));
    assert.ok(Math.min(...ys) >= 20 && Math.max(...ys) <= 10 + 10 + 14, `plan in the cell: ${Math.min(...ys)}..${Math.max(...ys)}`);
  });

  it('both off: the cell is the mark row alone, and the table is unchanged', async () => {
    const views = new Map([['w1', (await elementViews([boxMesh(1.2, 0.2, 1.5)]))!]]);
    const on = layoutSchedule(withSymbols(), labels, { scale: 20, views });
    const off = layoutSchedule(withSymbols({ elevation: false, plan: false }), labels, { scale: 20, views });
    assert.equal(off.prims.filter((p) => p.kind === 'path' && p.view !== undefined).length, 0);
    assert.deepEqual(dims(off), []);
    near(on.height - off.height, 109);
    assert.equal(off.width, on.width, 'the columns keep their width');
    assert.deepEqual(tableTexts(off), tableTexts(on));
  });

  it('without views the generated elevation goes with the elevation, and the plan toggle changes nothing', () => {
    const on = layoutSchedule(withSymbols(), labels, { scale: 20 });
    const noElevation = layoutSchedule(withSymbols({ elevation: false }), labels, { scale: 20 });
    const noPlan = layoutSchedule(withSymbols({ plan: false }), labels, { scale: 20 });
    assert.deepEqual(noPlan, on, 'there is no plan to hide');
    // Only the closed frame of the band is left of the paths.
    assert.equal(noElevation.prims.filter((p) => p.kind === 'path').length, 1);
    assert.ok(on.prims.filter((p) => p.kind === 'path').length > 10);
    assert.deepEqual(dims(noElevation), []);
    near(on.height - noElevation.height, Math.max(30, 1.5 * 50 + 14));
    assert.deepEqual(tableTexts(noElevation), tableTexts(on));
  });

  it('the pages count follows the shorter cell', () => {
    const many: ScheduleData = { levels: ['Ground'], entries: [win, { ...win, key: 'w2', mark: 'W2' }, { ...win, key: 'w3', mark: 'W3' }] };
    const full = layoutSchedule(many, labels, { scale: 20, maxWidth: 70, maxHeight: 200 });
    const light = layoutSchedule({ ...many, content: { symbols: { elevation: false, plan: false } } }, labels, { scale: 20, maxWidth: 70, maxHeight: 200 });
    assert.ok((full.pages ?? 1) > (light.pages ?? 1), `${full.pages} pages with the symbols, ${light.pages} without`);
  });
});
