/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '@/test/setup-dom.js';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clearDraftHistory, undoDrafts } from '@/drafting/draft-store';
import { resetProject, useProjectStore } from './project-store';
import { alignMoves, alignViewports, distributeMoves, distributeViewports, type AlignBox, type AlignMode } from './viewport-align';
import type { ProjectSheet, SheetViewport } from './types';

/** #168: lining drawings up, on plain boxes (centre and size, mm). */

const A: AlignBox = { id: 'a', x: 100, y: 100, width: 80, height: 40 }; // 60..140 x 80..120
const B: AlignBox = { id: 'b', x: 300, y: 250, width: 100, height: 60 }; // 250..350 x 220..280
const C: AlignBox = { id: 'c', x: 200, y: 400, width: 20, height: 100 }; // 190..210 x 350..450

const byId = (moves: readonly { id: string; x: number; y: number }[]) => Object.fromEntries(moves.map((m) => [m.id, m]));

describe('aligning (#168)', () => {
  const cases: [AlignMode, (id: 'b' | 'c') => { x: number; y: number }][] = [
    ['left', (id) => ({ x: 60 + (id === 'b' ? 50 : 10), y: id === 'b' ? 250 : 400 })],
    ['right', (id) => ({ x: 140 - (id === 'b' ? 50 : 10), y: id === 'b' ? 250 : 400 })],
    ['top', (id) => ({ x: id === 'b' ? 300 : 200, y: 80 + (id === 'b' ? 30 : 50) })],
    ['bottom', (id) => ({ x: id === 'b' ? 300 : 200, y: 120 - (id === 'b' ? 30 : 50) })],
    ['centreV', (id) => ({ x: 100, y: id === 'b' ? 250 : 400 })],
    ['centreH', (id) => ({ x: id === 'b' ? 300 : 200, y: 100 })],
  ];
  for (const [mode, expected] of cases) {
    it(`${mode}: the others line up with the first, which does not move`, () => {
      const moves = byId(alignMoves([A, B, C], mode));
      assert.equal(moves.a, undefined, 'the anchor is not moved');
      assert.deepEqual([moves.b.x, moves.b.y], [expected('b').x, expected('b').y]);
      assert.deepEqual([moves.c.x, moves.c.y], [expected('c').x, expected('c').y]);
    });
  }

  it('takes the first of the list as the anchor, not the leftmost or the biggest', () => {
    const moves = byId(alignMoves([C, A, B], 'left'));
    assert.equal(moves.c, undefined);
    assert.equal(moves.a.x - 40, 190, 'A\'s left edge on C\'s (190)');
    assert.equal(moves.b.x - 50, 190);
  });

  it('lists nothing for one drawing, and not a drawing already in line', () => {
    assert.deepEqual(alignMoves([A], 'left'), []);
    assert.deepEqual(alignMoves([], 'left'), []);
    assert.deepEqual(alignMoves([A, { ...B, x: 100 }], 'centreV'), []);
  });
});

describe('distributing (#168)', () => {
  it('keeps the outer two and makes the gaps between edges equal, across', () => {
    const moves = byId(distributeMoves([A, B, C], 'across'));
    // Left to right: A (60..140), C (190..210), B (250..350). Gap = (350 - 60 - 200) / 2 = 45.
    assert.equal(moves.a, undefined);
    assert.equal(moves.b, undefined);
    assert.equal(moves.c.x, 140 + 45 + 10);
    assert.equal(moves.c.y, 400, 'it does not move along the other axis');
  });

  it('works down, in the order the drawings lie, whatever order they were chosen in', () => {
    const moves = byId(distributeMoves([C, B, A], 'down'));
    // Top to bottom: A (80..120), B (220..280), C (350..450). Gap = (450 - 80 - 200) / 2 = 85.
    assert.equal(moves.a, undefined);
    assert.equal(moves.c, undefined);
    assert.equal(moves.b.y, 120 + 85 + 30);
    assert.equal(moves.b.x, 300);
  });

  it('spaces four, and lists nothing for fewer than three', () => {
    const d: AlignBox = { id: 'd', x: 500, y: 100, width: 20, height: 20 };
    const moves = byId(distributeMoves([A, B, C, d], 'across'));
    // A 60..140, C 190..210, B 250..350, d 490..510: gap = (510 - 60 - 220) / 3.
    const gap = (510 - 60 - 220) / 3;
    assert.ok(Math.abs(moves.c.x - (140 + gap + 10)) < 1e-9);
    assert.ok(Math.abs(moves.b.x - (140 + gap + 20 + gap + 50)) < 1e-9);
    assert.deepEqual(distributeMoves([A, B], 'across'), []);
  });
});

describe('writing to the sheet (#168)', () => {
  const vp = (id: string, x: number, y: number): SheetViewport => ({ id, viewId: 'v', x, y, scale: 100, width: 50, height: 50, center: null });
  beforeEach(() => {
    resetProject();
    clearDraftHistory();
    const sheet: ProjectSheet = { id: 's', number: 'A-1', name: 'S', createdAt: 0, paper: 'A1', orientation: 'landscape', viewports: [vp('a', 100, 100), vp('b', 300, 200), vp('c', 500, 300)] };
    useProjectStore.setState({ sheets: [sheet] });
  });
  const xs = () => (useProjectStore.getState().sheets[0].viewports ?? []).map((v) => [v.x, v.y]);
  const boxes: AlignBox[] = [{ id: 'a', x: 100, y: 100, width: 50, height: 50 }, { id: 'b', x: 300, y: 200, width: 50, height: 50 }, { id: 'c', x: 500, y: 300, width: 50, height: 50 }];

  it('moves every drawing in one undo step', () => {
    assert.equal(alignViewports('s', boxes, 'centreV'), true);
    assert.deepEqual(xs(), [[100, 100], [100, 200], [100, 300]]);
    undoDrafts();
    assert.deepEqual(xs(), [[100, 100], [300, 200], [500, 300]], 'one undo');
    assert.equal(distributeViewports('s', [boxes[0], { ...boxes[1], x: 150 }, boxes[2]], 'across'), true);
    undoDrafts();
    assert.deepEqual(xs(), [[100, 100], [300, 200], [500, 300]]);
  });

  it('writes and records nothing when nothing needs to move', () => {
    assert.equal(alignViewports('s', [boxes[0], boxes[0]].map((b, i) => ({ ...b, id: i ? 'b' : 'a' })), 'centreV'), false);
    assert.equal(distributeViewports('s', boxes, 'across'), false, 'already evenly spaced: 100, 300, 500');
    assert.deepEqual(xs(), [[100, 100], [300, 200], [500, 300]]);
  });
});
