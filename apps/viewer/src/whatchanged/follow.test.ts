/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** A tag or a label goes with its element when a new version moves it, once, and only in the view that shows it. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { newDraft } from '@/drafting/draft-store';
import { refToRing, ringToRef } from '@/labels/label-leader';
import { compareStates, type ModelChange } from './compare.js';
import { followMovedElements } from './follow.js';
import { snapshotFromElements, type SnapElement } from './snapshot.js';
import { planBand } from './visibility.js';

const plane: SectionPlaneConfig = { axis: 'y', position: 1.2, flipped: false };
const band = { ...planBand('plan', 0, 1.2), plane };
const bandOf = (id: string) => (id === 'plan' ? band : undefined);
const door = (over: Partial<SnapElement> = {}): SnapElement => ({ k: 'DOOR', t: 'IfcDoor', n: 'Door', d: 'd', g: 'g', a: [1, 0, 1, 2, 2, 1.2], ...over });
const changes = (before: SnapElement, after: SnapElement): ModelChange[] => compareStates(snapshotFromElements([before], 0), snapshotFromElements([after], 0));
const moved = (dx: number, dz = 0): SnapElement => door({ g: 'g2', a: [1 + dx, 0, 1 + dz, 2 + dx, 2, 1.2 + dz] });

const label = (view = 'plan') => newDraft(view, '0', { type: 'text', p: { x: 3, y: 1 }, text: 'Door', height: 0.25, rotation: 0, leader: { x: 2, y: 1.1 } }, { labelOf: 'DOOR', atype: 'tagall-mark', labelRef: ringToRef([{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 1.2 }, { x: 1, y: 1.2 }]) });
const tag = () => newDraft('plan', '0', { type: 'leader', pts: [{ x: 2, y: 1 }, { x: 3, y: 1.5 }], text: 'Door', height: 0.25 }, { tagOf: 'DOOR' });

describe('followMovedElements', () => {
  it('carries a label, its leader and the outline it points to by what the element moved in the view', () => {
    const c = changes(door(), moved(0.5));
    const [out] = followMovedElements([label()], c, bandOf);
    assert.equal(out.shape.type, 'text');
    if (out.shape.type !== 'text') return;
    assert.ok(Math.abs(Math.abs(out.shape.p.x - 3) - 0.5) < 1e-9 || Math.abs(Math.abs(out.shape.p.y - 1) - 0.5) < 1e-9, 'moved by half a metre along one axis of the drawing');
    const dx = out.shape.p.x - 3, dy = out.shape.p.y - 1;
    assert.deepEqual([out.shape.leader!.x - 2, out.shape.leader!.y - 1.1].map((v) => Math.round(v * 1e6)), [dx, dy].map((v) => Math.round(v * 1e6)), 'the leader goes the same way');
    const ring = refToRing(out.params.labelRef)!;
    assert.deepEqual([ring[0].x - 1, ring[0].y - 1].map((v) => Math.round(v * 1e3)), [dx, dy].map((v) => Math.round(v * 1e3)), 'so does the outline');
  });
  it('carries a tag the same way', () => {
    const [out] = followMovedElements([tag()], changes(door(), moved(0.5)), bandOf);
    assert.equal(out.shape.type, 'leader');
    if (out.shape.type !== 'leader') return;
    assert.equal(Math.round(Math.hypot(out.shape.pts[0].x - 2, out.shape.pts[0].y - 1) * 1e6), 500000);
    assert.deepEqual([out.shape.pts[1].x - out.shape.pts[0].x, out.shape.pts[1].y - out.shape.pts[0].y], [1, 0.5], 'its shape is kept');
  });
  it('moves it once: the same comparison again, or a later one against the same reference, adds only what is new', () => {
    const first = followMovedElements([label()], changes(door(), moved(0.5)), bandOf);
    const again = followMovedElements(first, changes(door(), moved(0.5)), bandOf);
    assert.equal(again, first, 'the same array: nothing moved');
    const further = followMovedElements(first, changes(door(), moved(0.8)), bandOf);
    const p = (d: typeof first) => (d[0].shape.type === 'text' ? d[0].shape.p : { x: NaN, y: NaN });
    assert.equal(Math.round(Math.hypot(p(further).x - 3, p(further).y - 1) * 1e6), 800000, 'from the original place, not twice');
  });
  it('leaves what the element did not move for, and what the view does not show', () => {
    const drafts = [label(), label('elsewhere'), tag()];
    assert.equal(followMovedElements(drafts, [], bandOf), drafts);
    assert.equal(followMovedElements(drafts, changes(door(), door({ g: 'g2', a: [1, 0, 1, 3, 2, 1.2] })), bandOf), drafts, 'a reshape is not a move');
    const out = followMovedElements(drafts, changes(door(), moved(0.5)), bandOf);
    assert.equal(out[1], drafts[1], 'a view with no plane is left alone');
  });
  it('leaves the annotation of an element that is gone where it is', () => {
    const gone = compareStates(snapshotFromElements([door()], 0), snapshotFromElements([], 0));
    const drafts = [label()];
    assert.equal(followMovedElements(drafts, gone, bandOf), drafts);
  });
});
