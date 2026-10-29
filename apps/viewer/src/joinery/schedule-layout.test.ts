/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultDoorSpec, defaultWindowSpec } from '@ifc-lite/create';
import { layoutSchedule, type ScheduleLabels } from './schedule-layout';
import { csvLines, joineryCsv } from './export-test-util';
import type { ScheduleData, ScheduleEntry } from './schedule-data';
import type { MeshData } from '@ifc-lite/geometry';
import { elementViews } from './element-views';
import { PAD } from '@bimvoice/ifcsheet';

const labels: ScheduleLabels = {
  locale: 'en', title: 'Joinery', mark: 'Mark', name: 'Name', size: 'Size', operation: 'Opening', sill: 'Sill', total: 'Total', uValue: 'U', fire: 'Fire',
  op: (op) => op,
};

const entry = (over: Partial<ScheduleEntry>): ScheduleEntry => ({
  key: 'k', kind: 'window', spec: defaultWindowSpec('W'), mark: 'W1', name: 'W', width: 1.2, height: 1.5, counts: {}, total: 0, occurrences: [], ...over,
});

const data: ScheduleData = {
  levels: ['Ground', 'Level 1'],
  entries: [
    entry({ key: 'w1', mark: 'W1', counts: { Ground: 3, 'Level 1': 2 }, total: 5 }),
    entry({ key: 'd1', kind: 'door', spec: defaultDoorSpec('D'), mark: 'D1', name: 'D', width: 0.9, height: 2.1, counts: { Ground: 1 }, total: 1 }),
    entry({ key: 'x', kind: 'door', spec: null, mark: '—', name: 'Door', width: 0.8, height: 2, counts: { 'Level 1': 4 }, total: 4 }),
  ],
};

const texts = (l: ReturnType<typeof layoutSchedule>) => l.prims.flatMap((p) => (p.kind === 'text' ? [p.text] : []));

describe('joinery schedule layout', () => {
  it('writes a card per type: mark, drawing dimensions, counts per level and total', () => {
    const layout = layoutSchedule(data, labels);
    const t = texts(layout);
    for (const s of ['Joinery', 'W1', 'D1', '1200', '1500', '900', '2100', 'Ground', 'Level 1', '3', '2', '5', '4', 'tilt-turn-left + side-right']) {
      assert.ok(t.includes(s), `missing ${s}`);
    }
    // The configured types draw their elevations; the untyped door a plain outline.
    assert.ok(layout.prims.filter((p) => p.kind === 'path').length > 10);
    assert.ok(layout.width > 34 + 3 * 30 - 1);
  });

  it('draws at the schedule scale and wraps cards into bands', () => {
    const at50 = layoutSchedule(data, labels, { scale: 50 });
    const at20 = layoutSchedule(data, labels, { scale: 20 });
    assert.ok(at20.width > at50.width);
    const narrow = layoutSchedule(data, labels, { scale: 50, maxWidth: 120 });
    assert.ok(narrow.height > at50.height * 1.5);
    assert.ok(narrow.width <= 120 || narrow.width < at50.width);
  });

  it('exports CSV with a column per level', () => {
    const csv = csvLines(joineryCsv(data, labels));
    assert.equal(csv[0], 'Mark,Name,Width (mm),Height (mm),Opening,Sill,Ground,Level 1,Total,U,Fire');
    assert.equal(csv[1], 'W1,W,1200,1500,tilt-turn-left + side-right,900,3,2,5,1.1,');
    assert.equal(csv[3].split(',')[0], '—');
  });

  it('quotes a cell holding the delimiter, so a European-locale Excel (which splits on `;`) keeps the row together', () => {
    const csv = csvLines(joineryCsv({ levels: [], entries: [entry({ key: 's', mark: 'W2', name: 'Sliding; left' })] }, labels, ';'));
    assert.ok(csv[1].startsWith('W2;"Sliding; left";'), csv[1]);
  });
});

describe('occurrenceMark', () => {
  it('numbers an element within its type, or after its name when the type has no mark', async () => {
    const { occurrenceMark } = await import('./schedule-data');
    const o = { modelId: 'm', expressId: 5, globalId: 'g', level: 'L1', tag: null, number: 3 };
    assert.equal(occurrenceMark(entry({ mark: 'W1' }), o), 'W1.3');
    assert.equal(occurrenceMark(entry({ mark: '—', name: 'Door' }), o), 'Door-3');
  });
});

/** A box mesh `w` x `d` x `h` standing on the ground, as an element's body. */
function boxMesh(w: number, d: number, h: number): MeshData {
  const pts: number[] = [];
  for (const [a, b, y] of [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0], [-1, -1, h], [1, -1, h], [1, 1, h], [-1, 1, h]]) pts.push(5 + (a * w) / 2, y, 7 + (b * d) / 2);
  const indices = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  return { expressId: 1, ifcType: 'IfcWindow', positions: new Float32Array(pts), normals: new Float32Array(pts.length), indices: new Uint32Array(indices), color: [1, 1, 1, 1] } as MeshData;
}

const viewBounds = (l: ReturnType<typeof layoutSchedule>, view: 'front' | 'plan' | 'section') => {
  const pts = l.prims.flatMap((p) => (p.kind === 'path' && p.view === view ? p.pts : []));
  assert.ok(pts.length > 0, `no ${view} view drawn`);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), top: Math.min(...ys), left: Math.min(...xs), right: Math.max(...xs), bottom: Math.max(...ys) };
};

describe('joinery schedule with views from the real geometry', () => {
  const win = entry({ key: 'w1', mark: 'W1', counts: { Ground: 1 }, total: 1 });
  const one: ScheduleData = { levels: ['Ground'], entries: [win] };

  it('draws the front, plan and section at the schedule scale', async () => {
    const views = new Map([['w1', (await elementViews([boxMesh(1.2, 0.2, 1.5)]))!]]);
    for (const scale of [20, 50]) {
      const k = 1000 / scale;
      const l = layoutSchedule(one, labels, { scale, views });
      const f = viewBounds(l, 'front'), p = viewBounds(l, 'plan'), s = viewBounds(l, 'section');
      const near = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 0.05, `1:${scale} ${what}: ${a} vs ${b}`);
      near(f.w, 1.2 * k, 'front width'); near(f.h, 1.5 * k, 'front height');
      near(p.w, 1.2 * k, 'plan width'); near(p.h, 0.2 * k, 'plan depth');
      near(s.w, 0.2 * k, 'section depth'); near(s.h, 1.5 * k, 'section height');
      // The plan lies under the front, the section beside it.
      assert.ok(p.top > f.bottom, 'plan under front');
      assert.ok(s.left > f.right, 'section beside front');
    }
  });

  it('keeps all of it inside the card, which grows to hold the views', async () => {
    const views = new Map([['w1', (await elementViews([boxMesh(1.2, 0.2, 1.5)]))!]]);
    const without = layoutSchedule(one, labels, { scale: 20 });
    const withViews = layoutSchedule(one, labels, { scale: 20, views });
    assert.ok(withViews.height > without.height);
    for (const view of ['front', 'plan', 'section'] as const) {
      const b = viewBounds(withViews, view);
      assert.ok(b.left >= 34 && b.right <= withViews.width && b.bottom <= withViews.height, `${view} inside the card`);
    }
  });

  it('draws the generated symbol where the element has no views', () => {
    const l = layoutSchedule(one, labels, { scale: 50, views: new Map() });
    assert.deepEqual(l, layoutSchedule(one, labels, { scale: 50 }));
    assert.ok(!l.prims.some((p) => p.kind === 'path' && p.view !== undefined));
  });

  it('overlays the opening symbol on the real front view', async () => {
    const views = new Map([['w1', (await elementViews([boxMesh(1.2, 0.2, 1.5)]))!]]);
    const l = layoutSchedule(one, labels, { scale: 20, views });
    assert.ok(l.prims.some((p) => p.kind === 'path' && p.view === 'symbol'));
  });
});

describe('the joinery schedule keeps its text inside the viewport clip (#42)', () => {
  it('the title, and every left-aligned run, starts at least a cell padding from the left edge', () => {
    for (const options of [{}, { scale: 50, maxWidth: 120 }]) {
      const runs = layoutSchedule(data, labels, options).prims.flatMap((p) => (p.kind === 'text' ? [p] : []));
      assert.ok(runs.some((r) => r.text === 'Joinery'), 'the title is on the sheet');
      for (const r of runs.filter((q) => q.anchor === 'start')) assert.ok(r.x >= PAD - 1e-9, `"${r.text}" starts at ${r.x}, left of the inset ${PAD}`);
    }
  });

  it('writes the hands the model states for doors without a configured type (#486)', () => {
    const doors: ScheduleData = { levels: ['Ground'], entries: [entry({ key: 'u', kind: 'door', spec: null, mark: 'D1', name: 'Door', width: 0.9, height: 2.1, counts: { Ground: 2 }, total: 2, operations: ['swing-left', 'swing-right'] })] };
    assert.ok(texts(layoutSchedule(doors, labels)).includes('swing-left + swing-right'));
    const bare: ScheduleData = { levels: ['Ground'], entries: [{ ...doors.entries[0], operations: undefined }] };
    assert.ok(!texts(layoutSchedule(bare, labels)).includes('swing-left + swing-right'));
  });
});
