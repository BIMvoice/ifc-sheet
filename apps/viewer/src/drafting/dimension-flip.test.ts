/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */


import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dimensionLayout } from './annotation';
import { flipDimensionSide } from './dimension-flip';
import { clearDraftHistory, editDrafts, newDraft, redoDrafts, undoDrafts } from './draft-store';
import { resetProject, useProjectStore } from '@/project/project-store';
import type { AnnotationShape } from './types';

type Dim = Extract<AnnotationShape, { type: 'dimension' }>;
const aligned: Dim = { type: 'dimension', variant: 'aligned', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, at: { x: 2, y: 1 }, height: 2.5 };

describe('flipDimensionSide', () => {
  it('mirrors an aligned dimension line across the measured segment, keeping its value', () => {
    const flipped = flipDimensionSide(aligned);
    assert.deepEqual(flipped.at, { x: 2, y: -1 });
    const [, , line] = dimensionLayout(flipped).lines;
    assert.equal(line.a.y, -1);
    assert.equal(line.b.y, -1);
    assert.equal(dimensionLayout(flipped).label, dimensionLayout(aligned).label);
    assert.deepEqual(flipDimensionSide(flipped), aligned);
  });

  it('mirrors a slanted segment perpendicular to it', () => {
    const slanted: Dim = { ...aligned, b: { x: 3, y: 3 }, at: { x: 0, y: 3 } };
    const f = flipDimensionSide(slanted);
    const mid = { x: 1.5, y: 1.5 };
    // The offset from the segment changes sign and keeps its size.
    const off = (p: { x: number; y: number }) => ((p.x - mid.x) * -1 + (p.y - mid.y) * 1) / Math.SQRT2;
    assert.ok(Math.abs(off(f.at) + off(slanted.at)) < 1e-9 && Math.abs(off(slanted.at)) > 0.5);
  });

  it('flips a linear dimension to the other side and moves a text the user placed with it', () => {
    const linear: Dim = { ...aligned, variant: 'linear', at: { x: 2, y: 1 }, textAt: { x: 3, y: 1.5 } };
    const f = flipDimensionSide(linear);
    assert.deepEqual(f.at, { x: 2, y: -1 });
    assert.deepEqual(f.textAt, { x: 3, y: -1.5 });
  });

  it('is one undo step in the drafts', () => {
    resetProject();
    clearDraftHistory();
    const draft = newDraft('v', 'l', aligned);
    useProjectStore.setState({ drafts: [draft] });
    editDrafts({ update: new Map([[draft.id, flipDimensionSide(aligned)]]) });
    const at = () => (useProjectStore.getState().drafts[0].shape as Dim).at;
    assert.deepEqual(at(), { x: 2, y: -1 });
    assert.ok(undoDrafts());
    assert.deepEqual(at(), { x: 2, y: 1 });
    assert.ok(redoDrafts());
    assert.deepEqual(at(), { x: 2, y: -1 });
  });
});
