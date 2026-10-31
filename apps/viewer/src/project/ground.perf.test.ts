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
import { drawingWithGround, GROUND_OVERHANG_M } from './ground.js';

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
    // The line stops GROUND_OVERHANG_M past the walls (#648): the edges inside that reach are the pairwise rule's, the two at its ends are cut.
    const reach = walls(14, 6).flatMap((l) => [l.line.start.x, l.line.end.x]);
    const lo = Math.min(...reach) - GROUND_OVERHANG_M; const hi = Math.max(...reach) + GROUND_OVERHANG_M;
    const inside = (l: DrawingLine) => Math.min(l.line.start.x, l.line.end.x) >= lo - 1e-9 && Math.max(l.line.start.x, l.line.end.x) <= hi + 1e-9;
    const key = (l: DrawingLine) => [l.line.start.x, l.line.start.y, l.line.end.x, l.line.end.y].map((v) => v.toFixed(9)).join();
    assert.ok(heavy.every(inside), 'nothing past the overhang');
    assert.deepEqual(heavy.filter((l) => [...expected].some((e) => key(e) === key(l))).map(key).sort(), [...expected].filter(inside).map(key).sort());
    assert.ok(heavy.length - [...expected].filter(inside).length <= 2, 'at most the two end edges are cut');
  });

  it('cuts the walls at the profile', () => {
    const out = drawingWithGround(drawing([...terrain(14), ...walls(14, 6)]), 'elevation');
    const wall = out.lines.filter((l) => l.ifcType === 'IfcWall');
    assert.ok(wall.length > 0 && wall.length < 24, 'some wall lines are cut away or shortened');
  });

  /** The fastest of three runs on a warmed engine, ms, and the drawing's heavy top profile. */
  const timed = (steps: number, wallCount: number) => {
    const d = drawing([...strip(steps, 100), ...walls(100, wallCount)]);
    const reach = d.lines.filter((l) => l.ifcType === 'IfcWall').flatMap((l) => [l.line.start.x, l.line.end.x]);
    const span = { lo: Math.min(...reach) - GROUND_OVERHANG_M, hi: Math.max(...reach) + GROUND_OVERHANG_M };
    let out = drawingWithGround(d, 'elevation');
    let ms = Infinity;
    for (let run = 0; run < 3; run++) {
      const started = performance.now();
      out = drawingWithGround(d, 'elevation');
      ms = Math.min(ms, performance.now() - started);
    }
    return { ms, out, span };
  };

  // The work grows with the terrain, not with its square: this is a ratio, so it holds on any machine, loaded or not. A quadratic
  // pass (the pairwise rule, or a scan of the profile per bisection step) takes about sixteen times as long for four times the edges.
  it('grows with the terrain, not with its square: four times the edges take less than eight times as long', () => {
    timed(1000, 100); // warm the engine up
    const small = timed(2500, 250);
    const large = timed(10_000, 1000);
    console.log(`ground profile scaling: ${small.ms.toFixed(0)} ms for 5 000 edges, ${large.ms.toFixed(0)} ms for 20 000 (x${(large.ms / small.ms).toFixed(1)})`);
    // The top chain is the profile, less what lies past the building's overhang (#648): the strip's edges are all of one width.
    const kept = large.out.lines.filter((l) => l.ifcType === 'IfcSite');
    assert.ok(kept.length > 9_800 && kept.length <= 10_000, `the top chain is the profile (${kept.length})`);
    assert.ok(kept.every((l) => Math.min(l.line.start.x, l.line.end.x) >= large.span.lo - 1e-9 && Math.max(l.line.start.x, l.line.end.x) <= large.span.hi + 1e-9), 'and stays within the overhang');
    assert.ok(large.out.lines.filter((l) => l.ifcType === 'IfcWall').length >= 1000, 'the walls stay');
    assert.ok(large.ms < 8 * small.ms, `x${(large.ms / small.ms).toFixed(1)}`);
  });

  // A ceiling for gross regressions only: a healthy pass takes tens of milliseconds, and the pairwise rule takes seconds, so a loaded
  // shared runner (this once measured 1412 ms in CI) stays well under it. Quadratic growth is the ratio test's to catch.
  it('comes in well under three seconds with 20 000 terrain edges and four thousand wall lines', () => {
    const { ms } = timed(10_000, 1000);
    console.log(`ground profile: 20000 edges, fastest of 3: ${ms.toFixed(0)} ms`);
    assert.ok(ms < 3000, `${ms.toFixed(0)} ms`);
  });
});
