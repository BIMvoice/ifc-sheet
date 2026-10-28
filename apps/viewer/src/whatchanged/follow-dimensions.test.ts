/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** A dimension snapped to model geometry is measured again on a new version, once, and only while the person has not moved it. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { dimensionLayout } from '@/drafting/annotation';
import { anchorOf, anchorsOf, encodeAnchor } from '@/drafting/dimension-anchor';
import { newDraft } from '@/drafting/draft-store';
import type { DraftEntity, Pt } from '@/drafting/types';
import { compareStates, type ModelChange } from './compare.js';
import { followDimensions } from './follow-dimensions.js';
import { snapshotFromElements, type SnapElement } from './snapshot.js';
import { planBand } from './visibility.js';

const plane: SectionPlaneConfig = { axis: 'y', position: 1.2, flipped: false };
const band = { ...planBand('plan', 0, 1.2), plane };
const bandOf = (id: string) => (id === 'plan' ? band : undefined);
/** A wall 4 m long along x, 0.2 m thick; the plan draws a world box (x, y up, z) at (x, z). */
const wall = (length: number, over: Partial<SnapElement> = {}): SnapElement => ({ k: 'WALL', t: 'IfcWall', n: 'Wall', d: 'd', g: `g${length}`, a: [0, 0, 0, length, 2.5, 0.2], ...over });
const changes = (before: SnapElement[], after: SnapElement[]): ModelChange[] => compareStates(snapshotFromElements(before, 0), snapshotFromElements(after, 0));
const lengthen = (to: number): ModelChange[] => changes([wall(4)], [wall(to)]);

const end = (p: Pt, rect: { x0: number; y0: number; x1: number; y1: number }, guid = 'WALL'): string => encodeAnchor(anchorOf(p, { guid, rect })!);
const FOOTPRINT = { x0: 0, y0: 0, x1: 4, y1: 0.2 };
const dim = (over: Partial<Extract<DraftEntity['shape'], { type: 'dimension' }>> = {}, params: Record<string, string> = { anchorA: end({ x: 0, y: 0 }, FOOTPRINT), anchorB: end({ x: 4, y: 0 }, FOOTPRINT) }): DraftEntity =>
  newDraft('plan', '0', { type: 'dimension', variant: 'aligned', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, at: { x: 2, y: -0.6 }, height: 0.25, ...over }, params);
const shapeOf = (d: DraftEntity) => d.shape as Extract<DraftEntity['shape'], { type: 'dimension' }>;
const reads = (d: DraftEntity) => dimensionLayout(shapeOf(d)).label;

describe('followDimensions', () => {
  it('measures the lengthened element again: the end on the lengthened side goes with it and the line keeps its distance', () => {
    const [out] = followDimensions([dim()], lengthen(4.5), bandOf);
    assert.equal(reads(dim()), '4.00');
    assert.equal(reads(out), '4.50');
    assert.deepEqual([shapeOf(out).a, shapeOf(out).b], [{ x: 0, y: 0 }, { x: 4.5, y: 0 }]);
    assert.ok(Math.abs(shapeOf(out).at.y + 0.6) < 1e-9 && Math.abs(shapeOf(out).at.x - 2.25) < 1e-9, 'centred on the new span, 0.6 m off the line as before');
  });
  it('carries the end that is on the wall and leaves the end that is not', () => {
    const [out] = followDimensions([dim({ a: { x: 4, y: 0 }, b: { x: 6, y: 0 } }, { anchorA: end({ x: 4, y: 0 }, FOOTPRINT) })], lengthen(4.5), bandOf);
    assert.equal(shapeOf(out).a.x, 4.5);
    assert.equal(shapeOf(out).b.x, 6, 'its free end stays');
  });
  it('does it once: the same comparison again, and a later one against the same reference, add only what is new', () => {
    const first = followDimensions([dim()], lengthen(4.5), bandOf);
    assert.equal(followDimensions(first, lengthen(4.5), bandOf), first, 'the same array: nothing moved');
    assert.equal(reads(followDimensions(first, lengthen(4.8), bandOf)[0]), '4.80', 'from the box it followed to, not twice');
  });
  it('lets go of an end the person has moved, and moves the other', () => {
    const [out] = followDimensions([dim({ a: { x: 0.3, y: 0 } })], lengthen(4.5), bandOf);
    assert.equal(shapeOf(out).a.x, 0.3);
    assert.equal(shapeOf(out).b.x, 4.5);
    assert.deepEqual(anchorsOf(out).map((x) => x.param), ['anchorB']);
    assert.equal(out.params.anchorA, undefined);
  });
  it('keeps the words of a dimension typed over by hand, and the place of its text relative to what it measures', () => {
    const [out] = followDimensions([dim({ text: 'approx. 4 m', textAt: { x: 2, y: -1 } })], lengthen(4.5), bandOf);
    assert.equal(shapeOf(out).text, 'approx. 4 m');
    assert.deepEqual(shapeOf(out).textAt, { x: 2.25, y: -1 });
  });
  it('leaves a dimension of an element that is gone where it is, and a free one, and the other views', () => {
    const drafts = [dim(), dim({}, {}), newDraft('elsewhere', '0', dim().shape, dim().params)];
    assert.equal(followDimensions(drafts, changes([wall(4)], []), bandOf), drafts);
    const rest = drafts.slice(1);
    assert.equal(followDimensions(rest, lengthen(4.5), bandOf), rest, 'a free dimension and one in a view with no plane are the same array back');
  });
  it('leaves a dimension alone when a change of the element does not move its end', () => {
    const drafts = [dim()];
    const [out] = followDimensions(drafts, changes([wall(4)], [wall(4, { d: 'other' })]), bandOf);
    assert.equal(reads(out), '4.00');
  });
  it('keeps a linear dimension\'s line level with where it was', () => {
    const [out] = followDimensions([dim({ variant: 'linear', at: { x: 2, y: -0.6 } })], lengthen(4.5), bandOf);
    assert.equal(reads(out), '4.50');
    assert.ok(Math.abs(shapeOf(out).at.y + 0.6) < 1e-9);
  });
});
