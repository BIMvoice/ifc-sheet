/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** LEVELALL's planner: a mark at each level the view shows and at the top, on one line, on the freer side. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { levelValueOf, type LevelShape } from '@/drafting/level-mark.js';
import { planLevels, type LevelsInput } from './plan.js';

const base: LevelsInput = {
  levels: [{ name: 'EG', elevation: 0 }, { name: 'DG', elevation: 3.1 }, { name: 'OG', elevation: 12 }, { name: 'UG', elevation: -3 }],
  bounds: { x0: 0, y0: -0.3, x1: 12, y1: 7.4 },
  existing: [],
  taken: [],
  textHeight: 0.25,
  paperUnit: 0.1,
};
const ys = (marks: { shape: LevelShape }[]) => marks.map((m) => m.shape.value);

describe('planLevels', () => {
  it('marks each storey level the view shows, and the top of the building', () => {
    const plan = planLevels(base);
    // 12 m and -3 m are outside the building shown; the top is its own mark.
    assert.deepEqual(ys(plan.marks), [0, 3.1, 7.4]);
  });
  it('puts them on one vertical line outside the building, each at its own height, referencing the building edge', () => {
    const { marks, side } = planLevels(base);
    assert.equal(side, 'right');
    assert.equal(new Set(marks.map((m) => m.shape.p.x)).size, 1);
    assert.ok(marks[0].shape.p.x > base.bounds.x1 + 1.2);
    marks.forEach((m) => {
      assert.equal(m.shape.p.y, m.shape.value);
      assert.deepEqual(m.shape.ref, { at: { x: base.bounds.x1, y: m.shape.value } });
      // The number is read from the reference: the mark follows the model.
      assert.equal(levelValueOf(m.shape, (r) => r.at.y + 1), m.shape.value + 1);
    });
  });
  it('takes the side with more room', () => {
    const note = { x0: 13, y0: 1, x1: 15, y1: 2 };
    assert.equal(planLevels({ ...base, taken: [note] }).side, 'left');
    const left = planLevels({ ...base, taken: [note] }).marks[0].shape;
    assert.ok(left.p.x + 5 * 0.25 < base.bounds.x0, 'the symbol, which reaches right, ends clear of the building');
    // Room is the free width beside the building: the nearer neighbour on each side decides.
    assert.equal(planLevels({ ...base, taken: [{ x0: -3, y0: 1, x1: -1, y1: 2 }, note] }).side, 'right');
  });
  it('adds only what is missing the second time', () => {
    const first = planLevels(base);
    const again = planLevels({ ...base, existing: first.marks.map((m) => m.shape) });
    assert.equal(again.marks.length, 0);
    assert.equal(again.already, 3);
    const partly = planLevels({ ...base, existing: [first.marks[1].shape] });
    assert.deepEqual(ys(partly.marks), [0, 7.4]);
  });
  it('does not mark the top twice when a storey is at the top', () => {
    const plan = planLevels({ ...base, levels: [...base.levels, { name: 'Roof', elevation: 7.4 }] });
    assert.deepEqual(ys(plan.marks), [0, 3.1, 7.4]);
  });
  it('is the same every time', () => assert.deepEqual(planLevels(base), planLevels(base)));
});
