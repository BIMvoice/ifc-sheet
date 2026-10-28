/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { frameOf, frameRect, titleBlockRect } from './sheet-frame.js';
import { paperOf } from './sheets.js';
import { SNAP_PX, snapMove, snapTargets, snapTolerance } from './viewport-snap.js';
import type { ProjectSheet } from './types';

/** #186: what a dragged viewport snaps to, and how near is near. */

const sheet: ProjectSheet = { id: 's', number: 'A-101', name: 'Plans', createdAt: 0, paper: 'A2', orientation: 'landscape', viewports: [] };
const paper = paperOf(sheet);
const frame = frameRect(paper, frameOf(sheet));
const block = titleBlockRect(paper, frameOf(sheet));
const other = { x: 380, y: 150, width: 100, height: 80 };
const targets = snapTargets(sheet, [other]);
const box = (x: number, y = 150) => ({ x, y, width: 100, height: 80 });

describe('snapping a dragged viewport', () => {
  it('puts an edge exactly on a neighbour\'s edge within the tolerance', () => {
    const tol = snapTolerance(1);
    const s = snapMove(box(330 - 50 + tol * 0.9), targets, tol);
    assert.equal(s.x, 280, 'the right edge (x + 50) is exactly on the neighbour\'s left edge (330)');
    assert.equal(s.y, 150);
    assert.ok(s.guides.some((g) => g.axis === 'x' && g.at === 330), 'and the guide is the neighbour\'s edge');
  });

  it('leaves it where it is just outside the tolerance', () => {
    const tol = snapTolerance(1);
    const s = snapMove(box(280 + tol * 1.1), targets, tol);
    assert.equal(s.x, 280 + tol * 1.1);
    assert.equal(s.guides.some((g) => g.axis === 'x'), false);
  });

  it('keeps the tolerance a distance on the screen: the same pixels at any zoom, so fewer millimetres when zoomed in', () => {
    assert.equal(snapTolerance(1), SNAP_PX);
    assert.equal(snapTolerance(4), SNAP_PX / 4);
    const gap = 3; // mm
    assert.equal(snapMove(box(280 + gap), targets, snapTolerance(1)).x, 280, 'zoomed out, 3 mm is 3 px: snaps');
    assert.equal(snapMove(box(280 + gap), targets, snapTolerance(4)).x, 283, 'zoomed in, 3 mm is 12 px: does not');
  });

  it('snaps centre to centre, and each axis on its own', () => {
    const s = snapMove(box(381.5, 148), targets, snapTolerance(1));
    assert.deepEqual([s.x, s.y], [380, 150]);
  });

  it('snaps to the frame (the margins), the drawing area and the title block', () => {
    const tol = snapTolerance(1);
    assert.equal(snapMove(box(frame.x + 50 + 2), targets, tol).x, frame.x + 50, 'left edge on the frame line');
    assert.equal(snapMove(box(150, frame.y + 40 - 3), targets, tol).y, frame.y + 40, 'top edge on the frame line');
    assert.equal(snapMove(box(150, block.y - 40 - 2), targets, tol).y, block.y - 40, 'bottom edge on the title block\'s top');
    assert.equal(snapMove(box(block.x - 50 - 1.5, 100), targets, tol).x, block.x - 50, 'right edge on the title block\'s left');
  });

  it('is the nearest line that wins', () => {
    const t = [{ axis: 'x' as const, at: 100, from: 0, to: 10 }, { axis: 'x' as const, at: 102, from: 0, to: 10 }];
    assert.equal(snapMove({ x: 150 + 1.8, y: 0, width: 100, height: 10 }, t, 5).x, 152, 'left edge at 101.8 goes to 102, not 100');
  });
});
