/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Joining cut faces: walls meeting at a corner, a T, end to end or
 * overlapping come out as one outline, with no line where they meet; faces
 * apart stay apart; four walls round a room leave the room as a hole.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { unionFaces, type Face, type Pt2 } from './cut-join.js';

const rect = (x0: number, y0: number, x1: number, y1: number): Face => ({ outer: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], holes: [] });
const area = (ring: readonly Pt2[]) => Math.abs(ring.reduce((s, p, i) => { const q = ring[(i + 1) % ring.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2);
const faceArea = (f: Face) => area(f.outer) - f.holes.reduce((s, h) => s + area(h), 0);
/** Whether any outline edge passes through `p` (a point where a joint line would be). */
const lineThrough = (faces: readonly Face[], p: Pt2) => faces.some((f) => [f.outer, ...f.holes].some((r) => r.some((a, i) => {
  const b = r[(i + 1) % r.length];
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  const within = Math.min(a.x, b.x) - 1e-9 <= p.x && p.x <= Math.max(a.x, b.x) + 1e-9 && Math.min(a.y, b.y) - 1e-9 <= p.y && p.y <= Math.max(a.y, b.y) + 1e-9;
  return Math.abs(cross) < 1e-9 && within;
})));

describe('unionFaces', () => {
  it('joins an L corner of two butting walls into one outline without the joint', () => {
    const out = unionFaces([rect(0, 0, 5, 0.3), rect(4.7, 0.3, 5, 4)]);
    assert.ok(out);
    assert.equal(out.length, 1);
    assert.equal(out[0].outer.length, 6, 'an L has six corners');
    assert.ok(Math.abs(faceArea(out[0]) - (5 * 0.3 + 0.3 * 3.7)) < 1e-9);
    assert.ok(!lineThrough(out, { x: 4.85, y: 0.3 }), 'no line across the corner');
  });

  it('joins a T: the face of the through wall loses the stretch the other wall meets', () => {
    const out = unionFaces([rect(0, 0, 10, 0.3), rect(4.9, 0.3, 5.1, 3)]);
    assert.ok(out);
    assert.equal(out.length, 1);
    assert.equal(out[0].outer.length, 8);
    assert.ok(!lineThrough(out, { x: 5, y: 0.3 }));
    assert.ok(lineThrough(out, { x: 2, y: 0.3 }), 'the through wall\'s face is still drawn beside the T');
  });

  it('joins overlapping walls (the usual corner of an exported model) into their union', () => {
    const out = unionFaces([rect(0, 0, 5, 0.3), rect(4.7, 0, 5, 4)]);
    assert.ok(out);
    assert.equal(out.length, 1);
    assert.ok(Math.abs(faceArea(out[0]) - (5 * 0.3 + 0.3 * 3.7)) < 1e-9);
    assert.ok(!lineThrough(out, { x: 4.7, y: 0.15 }), 'the overlapped wall end is not drawn');
  });

  it('joins walls end to end into one long wall', () => {
    const out = unionFaces([rect(0, 0, 3, 0.2), rect(3, 0, 7, 0.2)]);
    assert.ok(out);
    assert.equal(out.length, 1);
    assert.equal(out[0].outer.length, 4, 'one rectangle');
  });

  it('leaves faces that do not meet apart', () => {
    const out = unionFaces([rect(0, 0, 1, 1), rect(3, 0, 4, 1)]);
    assert.ok(out);
    assert.equal(out.length, 2);
  });

  it('leaves the room inside four walls as a hole', () => {
    const out = unionFaces([rect(0, 0, 6, 0.3), rect(0, 3.7, 6, 4), rect(0, 0.3, 0.3, 3.7), rect(5.7, 0.3, 6, 3.7)]);
    assert.ok(out);
    assert.equal(out.length, 1);
    assert.equal(out[0].holes.length, 1);
    assert.ok(Math.abs(area(out[0].holes[0]) - 5.4 * 3.4) < 1e-9);
  });

  it('joins walls whose meeting points differ by single-precision noise, as model geometry arrives', () => {
    // Coordinates as a float32 mesh gives them: the shared corner is not bit-identical in the two walls.
    const f = (v: number) => Math.fround(v + 0.7) - 0.7;
    const a = rect(f(1.668), f(-0.946), f(6.12), f(-0.851));
    const b: Face = { outer: [{ x: 6.120000362, y: -4.409000397 }, { x: 6.410000324, y: -4.409000397 }, { x: 6.410000324, y: 1.101000071 }, { x: 6.120000362, y: 1.101000071 }], holes: [] };
    const out = unionFaces([a, b]);
    assert.ok(out, 'joined, not given up on');
    assert.equal(out.length, 1);
  });

  it('gives one face back as it was', () => {
    const f = rect(0, 0, 1, 1);
    assert.deepEqual(unionFaces([f]), [f]);
  });
});
