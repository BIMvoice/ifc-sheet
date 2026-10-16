/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The ground of an elevation on a triangulated terrain: the top profile of
 * tens of thousands of edges must come in milliseconds, not minutes, and be the
 * profile the plain pairwise rule gives.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D, DrawingLine } from '@ifc-lite/drawing-2d';
import { drawingWithGround } from './ground.js';

const seg = (x0: number, y0: number, x1: number, y1: number, ifcType: string, entityId: number): DrawingLine => ({
  line: { start: { x: x0, y: y0 }, end: { x: x1, y: y1 } }, category: 'projection', visibility: 'visible', entityId, ifcType, modelIndex: 0, depth: 0,
});

/** A triangulated terrain of n x n vertices seen from the side: every grid edge and diagonal projected onto (x, height). */
function terrain(n: number): DrawingLine[] {
  const h = (i: number, j: number) => 2 + Math.sin(i * 0.31) * Math.cos(j * 0.23) * 1.5 + Math.sin((i + j) * 0.07);
  const out: DrawingLine[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (i + 1 < n) out.push(seg(i, h(i, j), i + 1, h(i + 1, j), 'IfcSite', 1));
      if (j + 1 < n) out.push(seg(i, h(i, j), i, h(i, j + 1), 'IfcSite', 1));
      if (i + 1 < n && j + 1 < n) out.push(seg(i, h(i, j), i + 1, h(i + 1, j + 1), 'IfcSite', 1));
    }
  }
  return out;
}

/** A terrain strip seen from the side: a top chain of `steps` edges and a base chain a metre under it, so no top edge is covered by another. */
function strip(steps: number, width: number): DrawingLine[] {
  const top = (i: number) => 2 + Math.sin((i / steps) * width * 0.5) * 1.5 + Math.sin(i * 0.9) * 0.002;
  const x = (i: number) => (i / steps) * width;
  const out: DrawingLine[] = [];
  for (let i = 0; i < steps; i++) out.push(seg(x(i), top(i), x(i + 1), top(i + 1), 'IfcSite', 1));
  for (let i = 0; i < steps; i++) out.push(seg(x(i), top(i) - 1, x(i + 1), top(i + 1) - 1, 'IfcSite', 1));
  return out;
}

/** Walls whose boxes straddle the ground, so their lines are cut by it. */
function walls(n: number, count: number): DrawingLine[] {
  const out: DrawingLine[] = [];
  for (let k = 0; k < count; k++) {
    const x = 1 + ((k * 7.31) % (n - 4));
    const y = 1.2 + ((k * 3.7) % 2);
    out.push(seg(x, y, x + 2.5, y, 'IfcWall', 100 + k), seg(x + 2.5, y, x + 2.5, y + 3, 'IfcWall', 100 + k), seg(x + 2.5, y + 3, x, y + 3, 'IfcWall', 100 + k), seg(x, y + 3, x, y, 'IfcWall', 100 + k));
  }
  return out;
}

const drawing = (lines: DrawingLine[]): Drawing2D => ({ lines, cutPolygons: [], projectionPolygons: [], bounds: { min: { x: 0, y: -1 }, max: { x: 100, y: 8 } } }) as unknown as Drawing2D;

/** The rule as first written, pairwise: a ground edge is on top when no other edge is above it at three points of it. */
function referenceTop(lines: DrawingLine[]): Set<DrawingLine> {
  const yAt = (l: DrawingLine, x: number): number | null => {
    const { start: a, end: b } = l.line;
    const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
    return hi - lo < 1e-6 || x < lo - 1e-6 || x > hi + 1e-6 ? null : a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
  };
  const open = lines.filter((l) => Math.abs(l.line.end.x - l.line.start.x) > 1e-6);
  return new Set(open.filter((l) => [0.25, 0.5, 0.75].every((t) => {
    const x = l.line.start.x + (l.line.end.x - l.line.start.x) * t;
    const y = yAt(l, x) as number;
    return !open.some((o) => o !== l && (yAt(o, x) ?? -Infinity) > y + 1e-4);
  })));
}

describe('the ground of an elevation on a triangulated terrain', () => {
  it('draws as its heavy top profile the same edges the pairwise rule keeps', () => {
    const ground = terrain(14);
    const out = drawingWithGround(drawing([...ground, ...walls(14, 6)]), 'elevation');
    const heavy = out.lines.filter((l) => l.ifcType === 'IfcSite');
    const expected = referenceTop(ground);
    assert.ok(expected.size > 10 && expected.size < ground.length / 2, `a real profile (${expected.size} of ${ground.length})`);
    assert.equal(heavy.length, expected.size);
    const key = (l: DrawingLine) => [l.line.start.x, l.line.start.y, l.line.end.x, l.line.end.y].map((v) => v.toFixed(9)).join();
    assert.deepEqual(heavy.map(key).sort(), [...expected].map(key).sort());
  });

  it('cuts the walls at the profile', () => {
    const out = drawingWithGround(drawing([...terrain(14), ...walls(14, 6)]), 'elevation');
    const wall = out.lines.filter((l) => l.ifcType === 'IfcWall');
    assert.ok(wall.length > 0 && wall.length < 24, 'some wall lines are cut away or shortened');
  });

  it('comes in well under a third of a second with 20 000 terrain edges and four thousand wall lines', () => {
    const ground = strip(10_000, 100);
    assert.equal(ground.length, 20_000);
    const d = drawing([...ground, ...walls(100, 1000)]);
    const started = performance.now();
    const out = drawingWithGround(d, 'elevation');
    const ms = performance.now() - started;
    console.log(`ground profile: ${ground.length} edges, ${ms.toFixed(0)} ms`);
    assert.equal(out.lines.filter((l) => l.ifcType === 'IfcSite').length, 10_000, 'the top chain is the profile');
    assert.ok(out.lines.filter((l) => l.ifcType === 'IfcWall').length >= 1000, 'the walls stay');
    // Near-linear work takes under a hundred milliseconds; the pairwise rule and a scan per bisection step take seconds.
    assert.ok(ms < 300, `${ms.toFixed(0)} ms`);
  });
});
