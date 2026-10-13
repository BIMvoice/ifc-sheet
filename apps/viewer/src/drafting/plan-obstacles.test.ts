/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** What a plan draws that annotation keeps clear of: one list for labels and figures. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rectsOf } from '@/labels/label-annotations.js';
import { rectsOverlap } from '@/labels/label-geometry.js';
import type { PlanOverlay } from '@/project/plan-overlays';
import { drawingPieces, overlayPieces } from './plan-obstacles.js';
import type { DraftEntity } from './types';

const overlay = (over: Partial<PlanOverlay>): PlanOverlay => ({ layer: 'SYMBOLS', width: 0.18, shapes: [], ...over });

describe('plan obstacles', () => {
  it('reads a door swing (an arc) as a run of pieces along it, not as its bounding box', () => {
    const pieces = overlayPieces([overlay({ shapes: [{ type: 'arc', c: { x: 0, y: 0 }, r: 1, start: 0, end: Math.PI / 2 }] })], 0.25);
    assert.ok(pieces.length >= 6);
    // The arc's far corner (1, 1) is not on the arc: no piece is there.
    assert.ok(pieces.every((p) => Math.hypot(p.a.x, p.a.y) > 0.99 && Math.hypot(p.a.x, p.a.y) < 1.01));
  });
  it('gives a text of an overlay (a pitch figure) a box', () => {
    const pieces = overlayPieces([overlay({ texts: [{ at: { x: 2, y: 2 }, text: '35°' }] })], 0.25);
    assert.equal(pieces.length, 1);
    assert.ok(pieces[0].box);
  });
  it('reads the generated drawing\'s visible lines and not its hidden ones', () => {
    const line = (visibility: string) => ({ entityId: 1, visibility, line: { start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } });
    const pieces = drawingPieces({ lines: [line('visible'), line('hidden')] } as never);
    assert.equal(pieces.length, 1);
  });
});

describe('boxes of a dimension for labels', () => {
  const dim = { id: 'd', viewId: 'v', layerId: 'l', params: {}, shape: { type: 'dimension', variant: 'aligned', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, at: { x: 2, y: -1 }, height: 0.25 } } as unknown as DraftEntity;
  const free = (x: number, y: number) => ({ x0: x - 0.2, y0: y - 0.2, x1: x + 0.2, y1: y + 0.2 });
  it('leaves the ground between the extension lines free', () => {
    const boxes = rectsOf([dim]);
    assert.ok(boxes.length > 1);
    assert.ok(!boxes.some((b) => rectsOverlap(b, free(1, -0.5))), 'between the extension lines, short of the figure');
  });
  it('covers the figure, on whichever side of its line it reads', () => {
    for (const y of [-1.35, -0.65]) assert.ok(rectsOf([dim]).some((b) => rectsOverlap(b, free(2, y))), `figure at y ${y}`);
  });
});
