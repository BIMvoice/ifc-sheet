/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Pt } from '@/drafting/types';
import { candidateCentres, orientedBox } from './label-candidates.js';
import { rectAround, rectHitsRing, rectRingGap, rectsOverlap, type Rect } from './label-geometry.js';
import { LABEL_GAP_MM, layoutLabels, type LayoutElement, type LayoutItem } from './label-layout.js';

const box = (x0: number, y0: number, x1: number, y1: number): Pt[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const wallAt = (id: string, x0: number, y0: number, x1: number, y1: number): LayoutElement => ({ id, ring: box(x0, y0, x1, y1) });
const item = (e: LayoutElement, w = 1, h = 0.4): LayoutItem => ({ id: e.id, ring: e.ring, w, h });
const rectOf = (c: Pt, w = 1, h = 0.4): Rect => rectAround(c, w, h);

describe('orientedBox', () => {
  it('finds the long side of a diagonal wall', () => {
    const c = Math.SQRT1_2, t = 0.1;
    const ring = [{ x: 0, y: 0 }, { x: 10 * c, y: 10 * c }, { x: 10 * c - t * c, y: 10 * c + t * c }, { x: -t * c, y: t * c }];
    const b = orientedBox(ring);
    assert.ok(Math.abs(b.hu - 5) < 1e-6 && Math.abs(b.hv - t / 2) < 1e-6, `${b.hu} ${b.hv}`);
  });
});

describe('candidateCentres', () => {
  const wall = orientedBox(box(0, 0, 10, 0.2));
  it('puts a long thin element centred along it, on the side facing away first', () => {
    const out = candidateCentres({ box: wall, w: 1, h: 0.4, gap: 0.15, away: { x: 0, y: -1 } });
    assert.ok(Math.abs(out[0].x - 5) < 1e-9 && out[0].y < 0, 'below, centred');
    assert.ok(out[1].y > 0.2 && Math.abs(out[1].x - 5) < 1e-9, 'then above');
  });
  it('clears the element by at least the gap, whatever the label size', () => {
    for (const [w, h] of [[1, 0.4], [3, 1.2], [0.2, 0.2]]) {
      for (const c of candidateCentres({ box: wall, w, h, gap: 0.15, away: { x: 0, y: 1 } }).slice(0, 8)) {
        assert.ok(rectRingGap(rectOf(c, w, h), box(0, 0, 10, 0.2)) >= 0.15 - 1e-9, `${w}x${h} at ${c.x},${c.y}`);
      }
    }
  });
  it('tries the sides of a compact element, the outer one first, then the corners, then further out', () => {
    const door = orientedBox(box(0, 0, 1, 0.5));
    const out = candidateCentres({ box: door, w: 0.5, h: 0.3, gap: 0.1, away: { x: 0, y: 1 } });
    assert.ok(out[0].y > 0.5, 'above first');
    assert.equal(out.length, 6 * 8);
    const gaps = out.map((c) => rectRingGap(rectOf(c, 0.5, 0.3), box(0, 0, 1, 0.5)));
    assert.ok(gaps[8] > gaps[0], 'the second ring is further out');
  });
  it('is deterministic', () => {
    const a = candidateCentres({ box: wall, w: 1, h: 0.4, gap: 0.15, away: { x: 1, y: 0 } });
    assert.deepEqual(candidateCentres({ box: wall, w: 1, h: 0.4, gap: 0.15, away: { x: 1, y: 0 } }), a);
  });
});

describe('layoutLabels', () => {
  const scene = (elements: LayoutElement[], annotations: Rect[] = [], paperUnit = 0.1) => ({ elements, annotations, paperUnit });

  it('puts a label beside its wall, off its outline, text box clear of it', () => {
    const w = wallAt('1', 0, 0, 10, 0.2);
    const p = layoutLabels([item(w)], scene([w])).get('1')!;
    assert.ok(p.free);
    assert.ok(!rectHitsRing(rectOf(p.centre), w.ring), 'not on the wall');
    assert.ok(rectRingGap(rectOf(p.centre), w.ring) >= LABEL_GAP_MM * 0.1 - 1e-9);
    assert.ok(Math.abs(p.centre.x - 5) < 1e-9, 'centred along it');
  });

  it('keeps two labels apart that would otherwise meet: two walls end to end with labels wider than each', () => {
    const a = wallAt('a', 0, 0, 5, 0.2), b = wallAt('b', 5, 0, 10, 0.2);
    const out = layoutLabels([item(a, 7, 0.6), item(b, 7, 0.6)], scene([a, b]));
    assert.ok(!rectsOverlap(rectOf(out.get('a')!.centre, 7, 0.6), rectOf(out.get('b')!.centre, 7, 0.6)));
    assert.ok(out.get('a')!.free && out.get('b')!.free);
  });

  it('keeps two labels off the walls between them', () => {
    // Two parallel walls close together: the sides between them would hold the labels on top of each other.
    const a = wallAt('a', 0, 0, 10, 0.2), b = wallAt('b', 0, 0.9, 10, 1.1);
    const out = layoutLabels([item(a, 3, 0.6), item(b, 3, 0.6)], scene([a, b]));
    const [ra, rb] = [rectOf(out.get('a')!.centre, 3, 0.6), rectOf(out.get('b')!.centre, 3, 0.6)];
    assert.ok(!rectsOverlap(ra, rb), 'labels do not overlap');
    assert.ok(!rectHitsRing(ra, b.ring) && !rectHitsRing(rb, a.ring), 'nor sit on the other wall');
  });

  it('keeps clear of annotations already there', () => {
    const w = wallAt('1', 0, 0, 10, 0.2);
    const first = layoutLabels([item(w)], scene([w])).get('1')!;
    const blocked = rectOf(first.centre, 1.2, 0.6);
    const next = layoutLabels([item(w)], scene([w], [blocked])).get('1')!;
    assert.ok(next.free && !rectsOverlap(rectOf(next.centre), blocked));
    assert.notDeepEqual(next.centre, first.centre);
  });

  it('works the same at 1:50 and 1:200: the gap is paper millimetres', () => {
    const w = wallAt('1', 0, 0, 10, 0.2);
    for (const unit of [0.05, 0.2]) {
      const p = layoutLabels([{ ...item(w), w: 20 * unit, h: 8 * unit }], scene([w], [], unit)).get('1')!;
      assert.ok(Math.abs(rectRingGap(rectOf(p.centre, 20 * unit, 8 * unit), w.ring) - LABEL_GAP_MM * unit) < 1e-9, `at ${unit}`);
    }
  });

  it('reaches past a neighbour that closes in the near places', () => {
    const w = wallAt('1', 0, 0, 10, 0.2), up = wallAt('up', -1, 0.35, 11, 0.45), down = wallAt('down', -1, -0.45, 11, -0.35);
    const p = layoutLabels([item(w)], scene([w, up, down])).get('1')!;
    assert.ok(p.free);
    assert.ok(!rectHitsRing(rectOf(p.centre), up.ring) && !rectHitsRing(rectOf(p.centre), down.ring));
  });

  it('gives the same answer twice, and reports when nowhere is free', () => {
    const w = wallAt('1', 0, 0, 10, 0.2);
    const run = () => layoutLabels([item(w)], scene([w]));
    assert.deepEqual([...run()], [...run()]);
    const wall = wallAt('2', 0, 0, 1, 0.2);
    const everywhere = [rectAround({ x: 0, y: 0 }, 400, 400)];
    assert.equal(layoutLabels([item(wall)], scene([wall], everywhere)).get('2')!.free, false);
  });

  it('does not count a backdrop slab as in the way, and does count a column', () => {
    const slab = wallAt('slab', -50, -50, 60, 60), w = wallAt('1', 0, 0, 10, 0.2);
    assert.ok(layoutLabels([item(w)], scene([slab, w])).get('1')!.free, 'a label may lie over the floor');
    const col = wallAt('col', 4.4, -0.8, 5.6, -0.1);
    const out = layoutLabels([item(w)], scene([w, col, wallAt('far', 100, 100, 101, 101)], [], 0.1)).get('1')!;
    assert.ok(!rectHitsRing(rectOf(out.centre), col.ring), 'a column beside the wall is not covered');
  });
});
