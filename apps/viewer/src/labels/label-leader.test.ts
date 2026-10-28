/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AnnotationType } from '@/catalogue/types';
import { newDraft } from '@/drafting/draft-store';
import { entitySkeleton, textLeader } from '@/drafting/annotation';
import type { DraftEntity, Pt } from '@/drafting/types';
import { settleLeader, withLeader } from './label-attach.js';
import { rectAround } from './label-geometry.js';
import { leaderStart, leaderTip, refToRing, ringToRef } from './label-leader.js';
import { settleLabels } from './label-sync.js';
import { wall } from './label-fixture.js';

const ring: Pt[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0.2 }, { x: 0, y: 0.2 }];
const at = (x: number, y: number) => rectAround({ x, y }, 1, 0.4);

describe('leaderTip', () => {
  it('displaced: none beside the element, one once further than the threshold', () => {
    assert.equal(leaderTip('displaced', at(5, 0.5), ring, 0.4), undefined, 'gap 0.1');
    const tip = leaderTip('displaced', at(5, 2), ring, 0.4);
    assert.deepEqual(tip, { x: 5, y: 0.2 });
  });
  it('never and always', () => {
    assert.equal(leaderTip('never', at(5, 9), ring, 0.4), undefined);
    assert.ok(leaderTip('always', at(5, 0.5), ring, 0.4));
  });
  it('none for a label lying on its element: nothing to point across', () => {
    assert.equal(leaderTip('always', at(5, 0.1), ring, 0.4), undefined);
  });
});

describe('leaderStart', () => {
  it('leaves a box on its edge towards the tip, and a bubble on its ellipse', () => {
    const outer = { x0: 0, y0: 0, x1: 2, y1: 1 };
    assert.deepEqual(leaderStart(outer, false, { x: 5, y: 0.5 }), { x: 2, y: 0.5 });
    const s = leaderStart(outer, true, { x: 5, y: 0.5 })!;
    assert.ok(Math.abs(s.x - 2) < 1e-9 && Math.abs(s.y - 0.5) < 1e-9);
    assert.equal(leaderStart(outer, false, { x: 1, y: 0.5 }), undefined, 'a tip inside has no line');
  });
});

describe('the outline a label keeps', () => {
  it('survives being written as text', () => {
    assert.deepEqual(refToRing(ringToRef(ring)), ring);
    assert.equal(refToRing('nonsense'), null);
    assert.equal(refToRing(undefined), null);
  });
});

const textAt = (x: number, y: number): DraftEntity => newDraft('v', '0', { type: 'text', p: { x, y }, text: 'W-01', height: 0.25, rotation: 0 }, { labelOf: 'G1', atype: 'at1', labelRef: ringToRef(ring) });

describe('dragging a label by hand', () => {
  it('adds the leader once it is dragged away, and drops it when brought back (same rule as placing)', () => {
    const far = settleLeader(textAt(5, 3), 'displaced', 0.1);
    assert.ok(far.shape.type === 'text' && far.shape.leader, 'far: leader');
    const back = settleLeader({ ...far, shape: { ...far.shape, p: { x: 4.8, y: 0.42 } } }, 'displaced', 0.1);
    assert.ok(back.shape.type === 'text' && !back.shape.leader, 'near again: none');
  });
  it('leaves an old label with no stored outline as it is', () => {
    const old = newDraft('v', '0', { type: 'text', p: { x: 5, y: 3 }, text: 'x', height: 0.25, rotation: 0 }, { labelOf: 'G1', atype: 'at1' });
    assert.equal(settleLeader(old, 'always', 0.1), old);
  });
  it('is idempotent', () => {
    const once = settleLeader(textAt(5, 3), 'displaced', 0.1);
    assert.equal(settleLeader(once, 'displaced', 0.1), once);
  });
  it('follows the label type: switching to never drops it, always keeps one beside the element', () => {
    const type = (leader: 'never' | 'displaced' | 'always'): AnnotationType => ({ id: 'at1', name: 'L', tool: 'label', label: { template: 'W-01', missing: 'question', leader } });
    const el = () => wall();
    const settle = (drafts: DraftEntity[], leader: 'never' | 'displaced' | 'always') => settleLabels(drafts, [type(leader)], el, 'en', () => 0.1);
    const far = settle([textAt(5, 3)], 'displaced');
    assert.ok(far[0].shape.type === 'text' && far[0].shape.leader);
    const none = settle(far, 'never');
    assert.ok(none[0].shape.type === 'text' && !none[0].shape.leader);
    const near = settle([textAt(5, 0.55)], 'always');
    assert.ok(near[0].shape.type === 'text' && near[0].shape.leader, 'always, even beside');
  });
});

describe('a text with a leader', () => {
  it('runs the line from its frame to the tip, and the line is part of what picks and bounds it', () => {
    const shape = withLeader({ type: 'text', p: { x: 5, y: 3 }, text: 'W-01', height: 0.25, rotation: 0, frame: 'box' }, ring, 'always', 0.1);
    const line = textLeader(shape)!;
    assert.ok(line.tip.y === 0.2 && line.from.y !== line.tip.y);
    assert.equal(entitySkeleton(shape).length, 2);
    assert.equal(entitySkeleton({ ...shape, leader: undefined }).length, 1);
  });
});
