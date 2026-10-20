/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** A room's footprint from its mesh, and where its label goes. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pointInRing, rectAround, rectInsideRing } from '@/labels/label-geometry.js';
import type { Pt } from '@/drafting/types';
import { footprintOf, ringArea, type SpaceMesh } from './footprint.js';
import { roomLabelPoint } from './room-point.js';

/** An L: 10 x 2 along the bottom and 2 x 10 up the left. Its centroid (3.2, 3.2) is outside the room. */
const L: Pt[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 10 }, { x: 0, y: 10 }];

/** A prism over `ring` between two heights, as a mesh in the viewer's Y-up frame (plan x, z). */
function prism(ring: Pt[], y0: number, y1: number): SpaceMesh {
  const positions: number[] = [];
  ring.forEach((p) => positions.push(p.x, y0, p.y));
  ring.forEach((p) => positions.push(p.x, y1, p.y));
  const n = ring.length, indices: number[] = [];
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; indices.push(i, j, n + i, j, n + j, n + i); }
  return { positions, indices };
}

describe('footprintOf', () => {
  it('cuts the space at the plan height and finds the outline and its area', () => {
    const f = footprintOf(prism(L, 0, 2.6), 1);
    assert.equal(f?.at, 'cut');
    assert.ok(Math.abs(ringArea(f!.ring) - 36) < 1e-6);
  });
  it('reads the base when the space does not reach the cut', () => {
    const f = footprintOf(prism(L, 0, 0.6), 1.2, 0);
    assert.equal(f?.at, 'base');
    assert.ok(Math.abs(ringArea(f!.ring) - 36) < 1e-6);
  });
  it('has none for a space of another storey that does not reach the cut', () => {
    assert.equal(footprintOf(prism(L, 3, 5.6), 1.2, 0), null);
    assert.equal(footprintOf(prism(L, -3, -0.4), 1.2, 0), null);
  });
  it('has none for a space with no geometry', () => assert.equal(footprintOf({ positions: [], indices: [] }, 1), null));
});

describe('roomLabelPoint', () => {
  const w = 1.4, h = 0.5;
  it('puts the label of an L-shaped room inside it, where the centroid is not', () => {
    assert.ok(!pointInRing(L, { x: 3.2, y: 3.2 }), 'the centroid of the L is in the notch');
    const p = roomLabelPoint(L, w, h, { rects: [], rings: [] }, 0.05);
    assert.ok(p.fits);
    assert.ok(rectInsideRing(rectAround(p.centre, w, h), L));
  });
  it('keeps clear of an annotation and of an element lying in the room', () => {
    const free = roomLabelPoint(L, w, h, { rects: [], rings: [] }, 0.05).centre;
    const taken = rectAround(free, w + 0.2, h + 0.2);
    const p = roomLabelPoint(L, w, h, { rects: [taken], rings: [] }, 0.05);
    assert.ok(p.fits && rectInsideRing(rectAround(p.centre, w, h), L));
    assert.ok(Math.abs(p.centre.x - free.x) > 0.1 || Math.abs(p.centre.y - free.y) > 0.1, 'moved off the taken place');
    const q = roomLabelPoint(L, w, h, { rects: [], rings: [[{ x: free.x - 1, y: free.y - 1 }, { x: free.x + 1, y: free.y - 1 }, { x: free.x + 1, y: free.y + 1 }, { x: free.x - 1, y: free.y + 1 }]] }, 0.05);
    assert.ok(q.fits && Math.hypot(q.centre.x - free.x, q.centre.y - free.y) > 0.5);
  });
  it('says so when the label is bigger than the room, and still answers inside it', () => {
    const closet: Pt[] = [{ x: 0, y: 0 }, { x: 0.8, y: 0 }, { x: 0.8, y: 0.8 }, { x: 0, y: 0.8 }];
    const p = roomLabelPoint(closet, w, h, { rects: [], rings: [] }, 0.05);
    assert.equal(p.fits, false);
    assert.ok(pointInRing(closet, p.centre));
  });
  it('gives the same answer every time', () => {
    assert.deepEqual(roomLabelPoint(L, w, h, { rects: [], rings: [] }, 0.05), roomLabelPoint(L, w, h, { rects: [], rings: [] }, 0.05));
  });
});
