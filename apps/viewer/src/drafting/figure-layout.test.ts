/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Where the figures of a string go: on the line, above and below in turn, or past the end with a leader. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dimensionLayout } from './annotation.js';
import { figureUp, layoutFacade, LIFT_DOWN, LIFT_UP } from './figure-layout.js';

const H = 0.25;
const opts = { height: H, sigma: 1 as const, over: 0.15 };

describe('layoutFacade', () => {
  it('leaves a figure that fits on the line', () => {
    const [[a]] = layoutFacade([{ points: [0, 4], offset: 1, widths: [0.7] }], opts);
    assert.deepEqual(a, { lift: 0, du: 0, clear: true });
  });

  it('lifts a narrow figure to the outward side of the line, where no extension line crosses it', () => {
    const narrow = { points: [3, 3.4, 8], offset: 1, widths: [0.7, 1] };
    assert.equal(layoutFacade([narrow], opts)[0][0].lift, LIFT_UP);
    // Where the reading side is inward, the outward side is the "below" one.
    assert.equal(layoutFacade([narrow], { ...opts, sigma: -1 })[0][0].lift, LIFT_DOWN);
  });

  it('puts the next narrow figure beside the first, not on it, with every figure clear', () => {
    const [places] = layoutFacade([{ points: [3, 3.4, 3.8, 8], offset: 1, widths: [0.7, 0.7, 0.7] }], opts);
    assert.equal(places[0].lift, LIFT_UP);
    assert.notDeepEqual([places[1].lift, places[1].du], [places[0].lift, places[0].du]);
    assert.deepEqual(places[2], { lift: 0, du: 0, clear: true });
    assert.ok(places.every((p) => p.clear));
  });

  it('sends the figure of a narrow end span out past the end, on the line, when above and below are taken', () => {
    const taken = [{ u0: -3, u1: 4, v0: 1.35, v1: 2.3 }, { u0: -3, u1: 4, v0: -0.4, v1: 0.9 }];
    const [[c]] = layoutFacade([{ points: [0, 0.3, 4], offset: 1, widths: [0.7, 1] }], { ...opts, obstacles: taken });
    assert.equal(c.lift, 0);
    assert.ok(c.du < -0.5 && c.clear, JSON.stringify(c));
  });

  it('shifts a figure along the string to the free side when both ends are far', () => {
    const [[a, b]] = layoutFacade([{ points: [0, 5, 5.3, 10], offset: 1, widths: [0.7, 0.7, 0.7] }], opts);
    assert.equal(a.lift, 0);
    assert.equal(b.lift, LIFT_UP);
    assert.ok(b.clear);
  });

  it('keeps clear of an extension line of a longer string through its span', () => {
    // An outer string has a point at 2.0, in the middle of the wide span of the inner string.
    const [[a]] = layoutFacade([{ points: [0, 4], offset: 1, widths: [0.7] }, { points: [0, 2, 4], offset: 2, widths: [0.5, 0.5] }], opts);
    assert.notDeepEqual({ lift: a.lift, du: a.du }, { lift: 0, du: 0 });
  });

  it('is the same every time', () => {
    const s = [{ points: [0, 0.3, 0.6, 1, 5], offset: 1, widths: [0.7, 0.7, 0.7, 0.7] }];
    assert.deepEqual(layoutFacade(s, opts), layoutFacade(s, opts));
  });
});

describe('a figure moved off its line', () => {
  const base = { type: 'dimension' as const, variant: 'aligned' as const, a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, at: { x: 2, y: -1 }, height: H };
  it('carries a leader from the line to the figure', () => {
    assert.equal(dimensionLayout(base).lines.length, 3);
    const moved = dimensionLayout({ ...base, textAt: { x: 2, y: -1.325 } });
    assert.equal(moved.lines.length, 4);
    assert.deepEqual(moved.lines[3].a, { x: 2, y: -1 });
    assert.ok(Math.abs(moved.lines[3].b.x - 2) < 1e-9, "ends under the figure, not past its edge");
  });
  it('reads up on a plan: screen-up for a horizontal line, screen-left for a vertical one', () => {
    const h = figureUp({ x: 1, y: 0 }, -1, 1), v = figureUp({ x: 0, y: 1 }, -1, 1);
    assert.ok(Math.abs(h.x) < 1e-9 && h.y < 0);
    assert.ok(v.x < 0 && Math.abs(v.y) < 1e-9);
  });
});
