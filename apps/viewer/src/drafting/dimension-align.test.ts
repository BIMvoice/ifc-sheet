/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Dimension lines line up with existing ones while a new dimension is placed:
 * the aligned and linear commands put the new line on a close parallel one.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetProject, useProjectStore } from '@/project/project-store';
import { clearDraftHistory, editDrafts, newDraft } from './draft-store.js';
import { dimensionLayout } from './annotation.js';
import { alignDimensionLine } from './dimension-align.js';
import { attachDraftingView, cancelCommand, clickDrawing, startDraftCommand, useDraftingSession } from './session.js';
import type { AnnotationShape, Pt } from './types.js';

type Dim = Extract<AnnotationShape, { type: 'dimension' }>;
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≉ ${b}`);
const TOL = 0.05;
const click = (x: number, y: number) => clickDrawing({ x, y }, TOL, false);
const dim = (variant: 'aligned' | 'linear', a: Pt, b: Pt, at: Pt): Dim => ({ type: 'dimension', variant, a, b, at, height: 0.25 });
const dims = (): Dim[] => useProjectStore.getState().drafts.flatMap((d) => (d.shape.type === 'dimension' ? [d.shape] : []));

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useDraftingSession.setState({ selection: new Set(), ortho: false, history: [], lastCommandId: null });
  attachDraftingView(null, 'down', () => []);
  attachDraftingView('view-1', 'down', () => []);
});

describe('alignDimensionLine', () => {
  const existing = [dim('aligned', { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 1 })];

  it('moves a close parallel line onto the existing one, keeping its place along the line', () => {
    const r = alignDimensionLine({ x: 6, y: 0 }, { x: 9, y: 0 }, 'aligned', { x: 7.5, y: 1.2 }, existing, 0.5);
    near(r.at.y, 1);
    near(r.at.x, 7.5);
    assert.ok(r.guide);
    near(Math.min(r.guide?.a.x ?? 99, r.guide?.b.x ?? 99), 0);
    near(Math.max(r.guide?.a.x ?? -99, r.guide?.b.x ?? -99), 9);
  });

  it('leaves a line that is farther than the tolerance', () => {
    const r = alignDimensionLine({ x: 6, y: 0 }, { x: 9, y: 0 }, 'aligned', { x: 7.5, y: 2 }, existing, 0.5);
    assert.deepEqual(r.at, { x: 7.5, y: 2 });
    assert.equal(r.guide, null);
  });

  it('ignores a dimension line that is not parallel', () => {
    const r = alignDimensionLine({ x: 6, y: 0 }, { x: 6, y: 3 }, 'aligned', { x: 7, y: 1.5 }, existing, 5);
    assert.equal(r.guide, null);
  });

  it('prefers the nearest of two candidates', () => {
    const two = [...existing, dim('aligned', { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 1.4 })];
    const r = alignDimensionLine({ x: 6, y: 0 }, { x: 9, y: 0 }, 'aligned', { x: 7.5, y: 1.3 }, two, 0.5);
    near(r.at.y, 1.4);
  });

  it('keeps a linear dimension horizontal', () => {
    const horizontal = [dim('linear', { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 1 })];
    const r = alignDimensionLine({ x: 6, y: 0 }, { x: 9, y: 0 }, 'linear', { x: 7.5, y: 0.9 }, horizontal, 0.5);
    near(r.at.y, 1);
  });
});

describe('DIMALIGNED / DIMLINEAR line placement', () => {
  const seed = (shape: Dim) => editDrafts({ add: [newDraft('view-1', '0', shape)] });

  it('puts the new dimension line on a close existing one', () => {
    seed(dim('aligned', { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 1 }));
    startDraftCommand('dimaligned');
    click(6, 0); click(9, 0); click(7.5, 1.1);
    const placed = dims().at(-1);
    assert.ok(placed);
    if (!placed) return;
    near(dimensionLayout(placed).lines[2].a.y, 1);
  });

  it('does not move a line placed well away from the others', () => {
    seed(dim('aligned', { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 1 }));
    startDraftCommand('dimaligned');
    click(6, 0); click(9, 0); click(7.5, 3);
    near(dimensionLayout(dims().at(-1) as Dim).lines[2].a.y, 3);
  });
});
