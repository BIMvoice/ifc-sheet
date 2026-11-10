/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** More than 3 leaves, a transom row that opens, and glazing bars in a type's drawings (#448). */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { defaultWindowSpec, normalisedPanels, panelRect } from '@ifc-lite/create';
import { readJoineryList, specFromOpening, type TypeOpening } from '@bimvoice/ifcsheet/project';
import { headArch } from './head-shape';
import { elevationSymbol, planSymbol, type JoineryStroke } from './symbols';

const SIZE = { width: 3, height: 1.5 };
const leaves = (n: number, op: TypeOpening['operations'][number] = 'side-left') => Array.from({ length: n }, () => op);
/** The panels' outlines: closed outline-weight rectangles, the frame's own outer one excluded. */
const outlines = (strokes: JoineryStroke[]) => strokes.slice(1).filter((s) => s.closed && s.weight === 'outline');

describe('the elevation draws every leaf', () => {
  it('five leaves are five panel outlines, side by side', () => {
    const spec = specFromOpening('window', SIZE, { operations: leaves(5), fanlight: false });
    const panels = outlines(elevationSymbol(spec));
    assert.equal(panels.length, 5);
    assert.equal(new Set(panels.map((p) => p.pts[0].x.toFixed(4))).size, 5, 'at five different places');
  });

  it('six leaves are six', () => {
    assert.equal(outlines(elevationSymbol(specFromOpening('window', SIZE, { operations: leaves(6), fanlight: false }))).length, 6);
  });
});

describe('the transom row', () => {
  it('a fixed one is one pane across, above the leaves', () => {
    const spec = specFromOpening('window', SIZE, { operations: leaves(4), fanlight: true });
    const rows = normalisedPanels(spec).filter((p) => p.row === 1);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].operation, 'fixed');
    assert.equal(outlines(elevationSymbol(spec)).length, 5);
  });

  it('an opening one is a top-hung light over each leaf, drawn with its own opening line, above the leaves', () => {
    const spec = specFromOpening('window', SIZE, { operations: leaves(3, 'fixed'), fanlight: true, fanlightOpens: true });
    const upper = normalisedPanels(spec).filter((p) => p.row === 1);
    assert.deepEqual(upper.map((p) => p.operation), ['top-hung', 'top-hung', 'top-hung']);
    assert.equal(outlines(elevationSymbol(spec)).length, 6, 'three leaves and three transom lights');
    const lower = panelRect(spec, normalisedPanels(spec).find((p) => p.row === 0)!);
    // Each top-hung light carries a triangle that lies wholly above the leaves' top.
    const tri = elevationSymbol(spec).filter((s) => !s.closed && s.pts.length === 3 && s.pts.every((p) => p.y > lower.z1));
    assert.equal(tri.length, 3);
  });

  it('a door has no opening transom light: it stays fixed', () => {
    const spec = specFromOpening('door', { width: 1.8, height: 2.5 }, { operations: ['swing-left', 'swing-right'], fanlight: true, fanlightOpens: true });
    assert.deepEqual(normalisedPanels(spec).filter((p) => p.row === 1).map((p) => p.operation), ['fixed']);
  });
});

describe('glazing bars', () => {
  const withBars = (horizontal: number, vertical: number, n = 2) =>
    specFromOpening('window', SIZE, { operations: leaves(n), fanlight: false, bars: { horizontal, vertical } });

  it('draw the counts asked for in every pane: 2 across and 1 up and down in two leaves are six bars', () => {
    const strokes = elevationSymbol(withBars(2, 1));
    const lines = strokes.filter((s) => !s.closed && s.pts.length === 2 && s.weight === 'thin');
    const across = lines.filter((s) => s.pts[0].y === s.pts[1].y);
    const upDown = lines.filter((s) => s.pts[0].x === s.pts[1].x);
    assert.equal(across.length, 4, '2 per leaf');
    assert.equal(upDown.length, 2, '1 per leaf');
  });

  it('stay inside the glass of their pane, evenly spaced', () => {
    const spec = withBars(0, 2, 1);
    const [only] = normalisedPanels(spec);
    const r = panelRect(spec, only);
    const xs = elevationSymbol(spec).filter((s) => s.pts.length === 2 && s.pts[0].x === s.pts[1].x).map((s) => s.pts[0].x).sort((a, b) => a - b);
    assert.equal(xs.length, 2);
    const inner = { x0: r.x0 + spec.sash.width, x1: r.x1 - spec.sash.width };
    const step = (inner.x1 - inner.x0) / 3;
    assert.ok(Math.abs(xs[0] - (inner.x0 + step)) < 1e-9 && Math.abs(xs[1] - (inner.x0 + 2 * step)) < 1e-9);
  });

  it('follow an arched head: no bar leaves the inner arch', () => {
    const spec = { ...withBars(2, 2, 1), head: { shape: 'round' as const } };
    const arch = headArch(spec)!;
    const plain = elevationSymbol({ ...spec, glazingBars: undefined });
    const drawn = elevationSymbol(spec).filter((s) => !plain.some((p) => JSON.stringify(p) === JSON.stringify(s)));
    assert.ok(drawn.length >= 4, 'the bars are drawn');
    for (const l of drawn) for (const p of l.pts) assert.ok(p.y <= arch.z(p.x, spec.frame.width + spec.sash.width) + 1e-6, 'inside the arch');
  });
});

describe('the plan symbol keeps the leaf count', () => {
  it('a door of four leaves is four open leaves, each with its swing arc', () => {
    const spec = specFromOpening('door', { width: 3.6, height: 2.1 }, { operations: leaves(4, 'swing-left'), fanlight: false, bars: { horizontal: 2, vertical: 2 } });
    const strokes = planSymbol(spec);
    assert.equal(strokes.filter((s) => s.closed && s.weight === 'outline').length, 4);
    assert.equal(strokes.filter((s) => !s.closed && s.pts.length > 8).length, 4, 'an arc per leaf');
  });

  it('a window of five leaves has the mullions between them, and bars add no plan line', () => {
    const two = planSymbol(specFromOpening('window', SIZE, { operations: leaves(2), fanlight: false }));
    const spec5 = specFromOpening('window', SIZE, { operations: leaves(5), fanlight: false });
    const five = planSymbol(spec5);
    const cut = (l: JoineryStroke[]) => l.filter((s) => s.weight === 'cut').length;
    // Each added leaf cuts a mullion and the two side members of its sash.
    assert.equal(cut(five) - cut(two), 3 * 3);
    assert.equal(planSymbol({ ...spec5, glazingBars: { horizontal: 3, vertical: 3 } }).length, five.length);
  });
});

describe('an old project reads and draws as before', () => {
  it('an entry saved without bars has none, and its elevation is the eight lines it always was', () => {
    const [old] = readJoineryList([JSON.parse(JSON.stringify(defaultWindowSpec()))]);
    assert.equal(old.glazingBars, undefined);
    assert.equal('glazingBars' in old, false);
    assert.equal(elevationSymbol(old).length, 8);
  });

  it('a bars entry with no bars in it reads as none', () => {
    const raw = { ...JSON.parse(JSON.stringify(defaultWindowSpec())), glazingBars: { horizontal: 0, vertical: 0 } };
    assert.equal(readJoineryList([raw])[0].glazingBars, undefined);
  });

  it('bars survive the project file, clamped to 5', () => {
    const raw = { ...JSON.parse(JSON.stringify(defaultWindowSpec())), glazingBars: { horizontal: 2, vertical: 9 } };
    assert.deepEqual(readJoineryList([JSON.parse(JSON.stringify(raw))])[0].glazingBars, { horizontal: 2, vertical: 5 });
  });
});
