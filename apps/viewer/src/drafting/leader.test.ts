/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * LEADER defaults to two segments: the arrow segment at any angle, then a
 * second segment that squares itself to horizontal / vertical when drawn near
 * it, with guides for those two directions while it is drawn.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetProject, useProjectStore } from '@/project/project-store';
import { clearDraftHistory } from './draft-store.js';
import { orthoGuides, snapLeaderEnd } from './leader-segments.js';
import { attachDraftingView, cancelCommand, clickDrawing, pressEnter, runningCommand, startDraftCommand, submitCommandLine, useDraftingSession } from './session.js';
import type { AnnotationShape } from './types.js';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≉ ${b}`);
const TOL = 0.05;
const click = (x: number, y: number) => clickDrawing({ x, y }, TOL, false);
const leaders = (): Extract<AnnotationShape, { type: 'leader' }>[] => useProjectStore.getState().drafts.flatMap((d) => (d.shape.type === 'leader' ? [d.shape] : []));

beforeEach(() => {
  cancelCommand();
  resetProject();
  clearDraftHistory();
  useDraftingSession.setState({ selection: new Set(), ortho: false, history: [], lastCommandId: null });
  attachDraftingView(null, 'down', () => []);
  attachDraftingView('view-1', 'down', () => []);
});

describe('LEADER', () => {
  it('takes the arrow point, a bend at any angle, then a second segment, and asks for the text', () => {
    startDraftCommand('leader');
    click(0, 0); click(3, 2); click(6, 2.2);
    assert.equal(runningCommand()?.wantsText?.(), true, 'the third point goes straight to the text');
    submitCommandLine('Fire door', null);
    const [leader] = leaders();
    assert.ok(leader);
    assert.equal(leader.pts.length, 3);
    assert.deepEqual(leader.pts[0], { x: 0, y: 0 });
    assert.deepEqual(leader.pts[1], { x: 3, y: 2 });
    assert.equal(leader.text, 'Fire door');
  });

  it('squares a nearly horizontal second segment', () => {
    startDraftCommand('leader');
    click(0, 0); click(3, 2); click(6, 2.3);
    submitCommandLine('A', null);
    assert.deepEqual(leaders()[0].pts[2], { x: 6, y: 2 });
  });

  it('squares a nearly vertical second segment', () => {
    startDraftCommand('leader');
    click(0, 0); click(3, 2); click(3.3, 6);
    submitCommandLine('A', null);
    assert.deepEqual(leaders()[0].pts[2], { x: 3, y: 6 });
  });

  it('leaves a second segment that is clearly diagonal', () => {
    startDraftCommand('leader');
    click(0, 0); click(3, 2); click(6, 5);
    submitCommandLine('A', null);
    assert.deepEqual(leaders()[0].pts[2], { x: 6, y: 5 });
  });

  it('still allows a one-segment leader with Enter after the bend point', () => {
    startDraftCommand('leader');
    click(0, 0); click(3, 2);
    pressEnter();
    submitCommandLine('A', null);
    assert.equal(leaders()[0].pts.length, 2);
  });

  it('previews the horizontal and vertical guides through the bend while the second segment is drawn', () => {
    startDraftCommand('leader');
    click(0, 0); click(3, 2);
    const preview = runningCommand()?.preview?.({ x: 6, y: 2.2 }) ?? [];
    const lines = preview.flatMap((s) => (s.type === 'line' ? [s] : []));
    assert.ok(lines.some((l) => l.a.y === 2 && l.b.y === 2), 'horizontal guide');
    assert.ok(lines.some((l) => l.a.x === 3 && l.b.x === 3), 'vertical guide');
  });
});

describe('snapLeaderEnd', () => {
  const elbow = { x: 3, y: 2 };
  it('snaps within the tolerance and keeps the distance along the axis', () => {
    const r = snapLeaderEnd(elbow, { x: 6, y: 2.3 });
    assert.deepEqual(r, { x: 6, y: 2 });
  });
  it('leaves a diagonal alone', () => {
    assert.deepEqual(snapLeaderEnd(elbow, { x: 6, y: 5 }), { x: 6, y: 5 });
  });
  it('returns the point itself when it is on the bend', () => {
    assert.deepEqual(snapLeaderEnd(elbow, elbow), elbow);
  });
});

describe('orthoGuides', () => {
  it('reaches at least the cursor distance on both sides of the bend', () => {
    const [h, v] = orthoGuides({ x: 3, y: 2 }, { x: 6, y: 5 }, 0.5);
    near(h.a.y, 2); near(h.b.y, 2);
    near(v.a.x, 3); near(v.b.x, 3);
    assert.ok(Math.min(h.a.x, h.b.x) <= -1 && Math.max(h.a.x, h.b.x) >= 7);
  });
});
