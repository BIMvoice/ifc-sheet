/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Continuous dimensions: DIMALIGNED and DIMLINEAR chain by default, each new
 * dimension starting at the previous one's end on the same dimension line,
 * until Enter ends the command.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetProject, useProjectStore } from '@/project/project-store';
import { clearDraftHistory } from './draft-store.js';
import { dimensionLayout } from './annotation.js';
import { continueDimension, type DimensionShape } from './dimension-chain.js';
import { attachDraftingView, cancelCommand, clickDrawing, pressEnter, startDraftCommand, submitCommandLine, useDraftingSession } from './session.js';
import type { Pt } from './types.js';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≉ ${b}`);
const TOL = 0.05;
const click = (x: number, y: number) => clickDrawing({ x, y }, TOL, false);
const dims = (): DimensionShape[] => useProjectStore.getState().drafts.flatMap((d) => (d.shape.type === 'dimension' ? [d.shape] : []));
const lineOf = (d: DimensionShape): { a: Pt; b: Pt } => dimensionLayout(d).lines[2];

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useDraftingSession.setState({ selection: new Set(), ortho: false, history: [], lastCommandId: null });
  attachDraftingView(null, 'down', () => []);
  attachDraftingView('view-1', 'down', () => []);
});

describe('continueDimension', () => {
  it('starts at the previous end and shares its dimension line', () => {
    const prev: DimensionShape = { type: 'dimension', variant: 'aligned', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, at: { x: 2, y: 1 }, height: 0.25 };
    const next = continueDimension(prev, { x: 7, y: 0 });
    assert.ok(next);
    if (!next) return;
    assert.deepEqual(next.a, prev.b);
    assert.deepEqual(next.b, { x: 7, y: 0 });
    near(lineOf(next).a.y, 1);
    near(lineOf(next).b.y, 1);
    assert.equal(dimensionLayout(next).label, '3.00');
  });

  it('keeps a linear dimension horizontal even when the next span is wider than the offset', () => {
    const prev: DimensionShape = { type: 'dimension', variant: 'linear', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, at: { x: 2, y: 1 }, height: 0.25 };
    const next = continueDimension(prev, { x: 14, y: 2 });
    assert.ok(next);
    if (!next) return;
    near(lineOf(next).a.y, 1);
    near(lineOf(next).b.y, 1);
    assert.equal(dimensionLayout(next).label, '10.00');
  });

  it('keeps the previous offset when an aligned chain turns a corner, instead of collapsing onto the measured edge', () => {
    const prev: DimensionShape = { type: 'dimension', variant: 'aligned', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, at: { x: 2, y: 1 }, height: 0.25 };
    const next = continueDimension(prev, { x: 4, y: 5 });
    assert.ok(next);
    if (!next) return;
    const line = lineOf(next);
    near(line.a.x, line.b.x); // parallel to the new (vertical) span
    near(Math.abs(line.a.x - 4), 1); // the same distance off it as before
    assert.equal(dimensionLayout(next).label, '5.00');
  });

  it('refuses a point on top of the previous end', () => {
    const prev: DimensionShape = { type: 'dimension', variant: 'aligned', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, at: { x: 2, y: 1 }, height: 0.25 };
    assert.equal(continueDimension(prev, { x: 4, y: 0 }), null);
  });
});

describe('DIMALIGNED / DIMLINEAR chain by default', () => {
  it('places several aligned dimensions in one command, each from the previous end', () => {
    startDraftCommand('dimaligned');
    click(0, 0); click(4, 0); click(2, 1);
    assert.equal(dims().length, 1);
    assert.equal(useDraftingSession.getState().commandId, 'dimaligned', 'the command is still running');
    click(7, 0);
    click(12, 0);
    const placed = dims();
    assert.equal(placed.length, 3);
    assert.deepEqual(placed[1].a, placed[0].b);
    assert.deepEqual(placed[2].a, placed[1].b);
    for (const d of placed) near(lineOf(d).a.y, 1);
    pressEnter();
    assert.equal(useDraftingSession.getState().commandId, null, 'Enter ends the chain');
    assert.equal(dims().length, 3);
  });

  it('chains linear dimensions too', () => {
    startDraftCommand('dimlinear');
    click(0, 0); click(4, 0); click(2, 1);
    click(9, 0);
    assert.equal(dims().length, 2);
    assert.equal(dims()[1].variant, 'linear');
    near(lineOf(dims()[1]).a.y, 1);
  });

  it('measures the next extension line origin from the previous end, for typed distances', () => {
    startDraftCommand('dimaligned');
    click(0, 0); click(4, 0); click(2, 1);
    submitCommandLine('3', { x: 100, y: 0 });
    assert.deepEqual(dims()[1].b, { x: 7, y: 0 });
  });

  it('SINGLE restores the one-dimension command', () => {
    startDraftCommand('dimaligned');
    submitCommandLine('single', null);
    click(0, 0); click(4, 0); click(2, 1);
    assert.equal(useDraftingSession.getState().commandId, null);
    assert.equal(dims().length, 1);
    startDraftCommand('dimaligned');
    submitCommandLine('continuous', null);
    click(0, 0); click(4, 0); click(2, 1);
    assert.equal(useDraftingSession.getState().commandId, 'dimaligned');
  });
});
