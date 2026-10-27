/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A chain of dimensions (what the DIM commands produce) edited as one: points
 * added, removed, the chain split; each edit is one undo step.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetProject, useProjectStore } from '@/project/project-store';
import { clearDraftHistory, undoDrafts } from './draft-store.js';
import { dimensionLayout } from './annotation.js';
import { chainOf, chainPoints } from './dimension-chain-edit.js';
import { attachDraftingView, cancelCommand, clickDrawing, patchDraftSettings, pressEnter, startDraftCommand, useDraftingSession } from './session.js';
import type { Pt } from './types.js';

const click = (x: number, y: number) => clickDrawing({ x, y }, 0.05, false);
const drafts = () => useProjectStore.getState().drafts;
const dimIds = () => drafts().filter((d) => d.shape.type === 'dimension').map((d) => d.id);
const labels = (id: string) => chainOf(drafts(), id).map((d) => (d.shape.type === 'dimension' ? dimensionLayout(d.shape).label : ''));
const xs = (id: string) => chainPoints(chainOf(drafts(), id)).map((p: Pt) => p.x);
/** Run a chain command: pick the dimension under (2, 1), click the points, Enter. */
function edit(command: string, ...points: [number, number][]) {
  startDraftCommand(command);
  click(2, 1);
  for (const [x, y] of points) click(x, y);
  pressEnter();
}
const lineYs = () => drafts().flatMap((d) => (d.shape.type === 'dimension' ? [dimensionLayout(d.shape).lines[2].a.y, dimensionLayout(d.shape).lines[2].b.y] : []));

beforeEach(() => {
  cancelCommand();
  patchDraftSettings({ dimAlign: true, dimContinuous: true });
  resetProject();
  clearDraftHistory();
  useDraftingSession.setState({ selection: new Set(), ortho: false, history: [], lastCommandId: null });
  attachDraftingView(null, 'down', () => []);
  attachDraftingView('view-1', 'down', () => []);
  // A chain the way DIMALIGNED draws it: 0-4-9-12 on one line, 1 above.
  startDraftCommand('dimaligned');
  click(0, 0); click(4, 0); click(2, 1); click(9, 0); click(12, 0);
  pressEnter();
});

describe('chain dimensions', () => {
  it('the DIM command makes one chain of its dimensions', () => {
    assert.deepEqual(xs(dimIds()[0]), [0, 4, 9, 12]);
    assert.deepEqual(labels(dimIds()[1]), ['4.00', '5.00', '3.00']);
  });

  it('adds a point inside the chain, splitting a span, as one undo step', () => {
    const [first] = dimIds();
    edit('dimaddpoint', [6, 0]);
    assert.deepEqual(xs(first), [0, 4, 6, 9, 12]);
    assert.deepEqual(labels(first), ['4.00', '2.00', '3.00', '3.00']);
    assert.ok(lineYs().every((y) => Math.abs(y - 1) < 1e-9), 'every span stays on the chain line');
    assert.ok(undoDrafts());
    assert.deepEqual(xs(first), [0, 4, 9, 12]);
  });

  it('adds a point beyond either end, extending the chain', () => {
    const [first] = dimIds();
    edit('dimaddpoint', [15, 0], [-2, 0]);
    assert.deepEqual(xs(first), [-2, 0, 4, 9, 12, 15]);
    assert.ok(lineYs().every((y) => Math.abs(y - 1) < 1e-9));
  });

  it('removes a witness point, joining its two spans, as one undo step', () => {
    const [first] = dimIds();
    edit('dimremovepoint', [4, 0]);
    assert.deepEqual(xs(first), [0, 9, 12]);
    assert.deepEqual(labels(first), ['9.00', '3.00']);
    assert.ok(undoDrafts());
    assert.deepEqual(xs(first), [0, 4, 9, 12]);
  });

  it('removes an end point by dropping its span', () => {
    const [first] = dimIds();
    edit('dimremovepoint', [12, 0]);
    assert.deepEqual(xs(first), [0, 4, 9]);
  });

  it('splits the chain in two at a point, as one undo step, without moving anything', () => {
    const [first, , last] = dimIds();
    const before = drafts().map((d) => d.shape);
    edit('dimsplit', [9, 0]);
    assert.deepEqual(xs(first), [0, 4, 9]);
    assert.deepEqual(xs(last), [9, 12]);
    assert.deepEqual(drafts().map((d) => d.shape), before);
    assert.ok(undoDrafts());
    assert.deepEqual(xs(first), [0, 4, 9, 12]);
  });

  it('leaves the chain alone for a click that is not near a point, or a lone dimension', () => {
    const before = drafts();
    edit('dimremovepoint', [6, 0]);
    edit('dimsplit', [0, 0]);
    assert.equal(drafts(), before);
  });
});
