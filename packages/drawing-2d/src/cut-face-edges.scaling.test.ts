/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A line across a cut face of many edges costs in proportion to its crossings, not their square (#863).
 *
 * `dropInsideCutFaces` splits a line where it crosses a cut face and asks, at the middle of each piece, whether it is inside
 * the face. That test walked every edge of the face, so a line with as many crossings as the face has edges cost the square
 * of them: on O-S1's South Elevation, where the plane cuts faces of thousands of edges, it was 380 s of a 427 s drawing.
 * The face's edges are now filed in a grid, and a point reads only those near it and along one ray out of the face. The
 * time is compared within the test, best of three: eight times the edges took 56 times as long before and 3.4 times now
 * (measured), and the bound is 24. The pieces kept are checked too, so a fast wrong answer fails.
 */

import { describe, it, expect } from 'vitest';
import { dropInsideCutFaces } from './cut-face-occlusion.js';
import type { DrawingLine, DrawingPolygon } from './types.js';

/** A cut face 100 m long whose top is a saw of `teeth` teeth, from 1 m to 3 m high, over a flat bottom at 0. */
function saw(teeth: number): DrawingPolygon {
  const outer = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
  for (let i = teeth; i >= 0; i--) outer.push({ x: (100 * i) / teeth, y: i % 2 ? 3 : 1 });
  return { polygon: { outer, holes: [] }, entityId: 1, ifcType: 'IfcGeographicElement', modelIndex: 0 } as unknown as DrawingPolygon;
}

/** Two lines behind the cut, across the whole face at 2 m: each crosses every tooth. */
const LINES: DrawingLine[] = [2, 2.2].map((y, i) => ({
  line: { start: { x: -1, y }, end: { x: 101, y } },
  category: 'projection', visibility: 'visible', entityId: 100 + i, ifcType: 'IfcWall', modelIndex: 0, depth: 1,
} as DrawingLine));

function timed(teeth: number): { ms: number; kept: DrawingLine[] } {
  let ms = Infinity;
  let kept: DrawingLine[] = [];
  for (let run = 0; run < 3; run++) {
    const face = saw(teeth); // a fresh face: its edges are filed on first use, inside the timing
    const t = performance.now();
    kept = dropInsideCutFaces(LINES, [face]);
    ms = Math.min(ms, performance.now() - t);
  }
  return { ms, kept };
}

describe('dropInsideCutFaces across a face of many edges (#863)', () => {
  it('eight times the crossings does not cost sixty-four times as much, and keeps the pieces between the teeth', () => {
    const few = timed(1_000);
    const many = timed(8_000);
    for (const [teeth, { kept }] of [[1_000, few], [8_000, many]] as const) {
      // Each line is kept where it runs above the saw, over each valley: one piece a valley, the two end ones run on outside.
      for (const [k, line] of LINES.entries()) {
        const pieces = kept.filter((l) => l.entityId === line.entityId);
        expect(pieces.length).toBe(teeth / 2 + 1);
        const length = pieces.reduce((n, l) => n + Math.abs(l.line.end.x - l.line.start.x), 0);
        // Above the saw: half of it at 2 m, 60% at 2.2 m, and the metre outside the face at each end.
        expect(length).toBeCloseTo(2 + 100 * (k === 0 ? 0.5 : 0.6), 1);
      }
    }
    expect(many.ms / Math.max(few.ms, 1)).toBeLessThan(24);
  }, 120_000);
});
