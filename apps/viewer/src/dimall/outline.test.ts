/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The outline of a building is traced from a grid of cells, each filled when a point in it lies in a shape. The cell fill looks
 * only at the shapes whose box reaches the cell (it took 18 s on a school's plan when it looked at them all, #333); it must fill
 * exactly the cells that looking at every shape would.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Pt } from '@/drafting/types';
import { boxOf, filledCells, gridLines, outlineOf } from './outline';

function pointInRing(p: Pt, ring: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The fill as it was: every cell against every shape. */
function everyShape(shapes: readonly (readonly Pt[])[], xs: readonly number[], ys: readonly number[]): boolean[][] {
  const boxes = shapes.map(boxOf);
  const spots: [number, number][] = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
  return Array.from({ length: xs.length - 1 }, (_, i) => Array.from({ length: ys.length - 1 }, (_, j) => spots.some(([fx, fy]) => {
    const c: Pt = { x: xs[i] + (xs[i + 1] - xs[i]) * fx, y: ys[j] + (ys[j + 1] - ys[j]) * fy };
    return shapes.some((r, k) => c.x > boxes[k].x0 && c.x < boxes[k].x1 && c.y > boxes[k].y0 && c.y < boxes[k].y1 && pointInRing(c, r));
  })));
}

/** A small deterministic generator, so a failure repeats. */
function random(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

/** Walls and openings as a plan has them: boxes, some mitred (a diagonal corner), some tilted, with edges a hair off the grid. */
function shapesOf(rand: () => number, count: number): Pt[][] {
  return Array.from({ length: count }, () => {
    const x = Math.round(rand() * 400) / 10, y = Math.round(rand() * 300) / 10, w = 0.2 + rand() * 6, h = 0.2 + rand() * 6;
    const hair = () => (rand() < 0.3 ? (rand() - 0.5) * 0.008 : 0);
    const [x0, y0, x1, y1] = [x + hair(), y + hair(), x + w + hair(), y + h + hair()];
    if (rand() < 0.25) return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1 - 0.2, y: y1 }, { x: x0 + 0.2, y: y1 }];
    return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  });
}

describe('the cell fill of the outline', () => {
  it('fills exactly the cells that testing every shape fills', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const shapes = shapesOf(random(seed), 40 + seed * 20);
      const grid = (values: number[]) => [...new Set(values)].sort((a, b) => a - b);
      const xs = grid(shapes.flatMap((r) => r.map((p) => p.x))), ys = grid(shapes.flatMap((r) => r.map((p) => p.y)));
      const filled = filledCells(shapes, shapes.map(boxOf), xs, ys);
      const expected = everyShape(shapes, xs, ys);
      const differing = filled.flatMap((col, i) => col.flatMap((on, j) => (on !== expected[i][j] ? [[i, j]] : [])));
      assert.deepEqual(differing, [], `seed ${seed}: cells that differ`);
      assert.ok(filled.some((col) => col.some(Boolean)), 'something is filled');
    }
  });

  it('fills the same where cells are narrower than the edges are off the grid', () => {
    // Edges within 5 mm of each other share one grid line (their mean), so a box can reach a little past the line it sits on
    // and into a cell only a few millimetres wide: the cell must still look at that box.
    for (const seed of [11, 12, 13, 14]) {
      const rand = random(seed);
      const lattice = (n: number) => Math.round(rand() * n) * 0.0061 + (rand() - 0.5) * 0.004;
      const shapes = Array.from({ length: 60 }, (): Pt[] => {
        const x0 = lattice(30), y0 = lattice(30), x1 = x0 + Math.max(0.02, lattice(30)), y1 = y0 + Math.max(0.02, lattice(30));
        return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
      });
      const xs = gridLines(shapes.flatMap((r) => r.map((p) => p.x))), ys = gridLines(shapes.flatMap((r) => r.map((p) => p.y)));
      const filled = filledCells(shapes, shapes.map(boxOf), xs, ys);
      const expected = everyShape(shapes, xs, ys);
      const differing = filled.flatMap((col, i) => col.flatMap((on, j) => (on !== expected[i][j] ? [[i, j]] : [])));
      assert.deepEqual(differing, [], `seed ${seed}: cells that differ`);
      assert.ok(filled.some((col) => col.some(Boolean)), 'something is filled');
    }
  });

  it('still traces the outline of a mass of walls', () => {
    const wall = (x0: number, y0: number, x1: number, y1: number): Pt[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
    const loop = outlineOf([wall(0, 0, 10, 0.3), wall(0, 5, 10, 5.3), wall(0, 0, 0.3, 5.3), wall(9.7, 0, 10, 5.3)]);
    assert.deepEqual(loop && boxOf(loop), { x0: 0, y0: 0, x1: 10, y1: 5.3 });
  });
});
