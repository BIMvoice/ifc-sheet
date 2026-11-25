/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `dropInsideCutFaces` does not test every line against every cut face (#863).
 *
 * It used to: lines times faces. On a storey of skolebygg (233,874 lines, 4,016 cut faces) that was the largest part
 * of the hidden-line stage, and a storey of a larger model, or a second model adding its cut faces to the same plan,
 * made it worse in proportion. With the faces in a grid, a line looks only at the faces near it, so sixteen times the
 * faces, none of them near the lines, cost about the same. The time is compared within this test, on one machine, and
 * the bound is wide: the old way took over ten times as long.
 */

import { describe, it, expect } from 'vitest';
import { dropInsideCutFaces } from './cut-face-occlusion.js';
import type { DrawingLine, DrawingPolygon } from './types.js';

/** `count` square cut faces (columns, 0.3 m) in a row along y = 0. */
function columns(count: number): DrawingPolygon[] {
  return Array.from({ length: count }, (_, i) => ({
    polygon: { outer: [{ x: i, y: 0 }, { x: i + 0.3, y: 0 }, { x: i + 0.3, y: 0.3 }, { x: i, y: 0.3 }], holes: [] },
    entityId: i + 1, ifcType: 'IfcColumn', modelIndex: 0,
  } as unknown as DrawingPolygon));
}

/** `count` short projection lines below the cut, away from the columns but for the first few. */
function lines(count: number): DrawingLine[] {
  return Array.from({ length: count }, (_, i) => ({
    line: { start: { x: (i % 200) * 0.5, y: 5 + Math.floor(i / 200) * 0.01 }, end: { x: (i % 200) * 0.5 + 0.2, y: 5 + Math.floor(i / 200) * 0.01 } },
    category: 'projection', visibility: 'visible', entityId: 100_000 + i, ifcType: 'IfcWall', modelIndex: 0, depth: 1,
  } as DrawingLine));
}

function timed(faces: number, ls: DrawingLine[]): { ms: number; kept: number } {
  const polygons = columns(faces);
  const t = performance.now();
  const kept = dropInsideCutFaces(ls, polygons).length;
  return { ms: performance.now() - t, kept };
}

describe('dropInsideCutFaces with many cut faces (#863)', () => {
  it('sixteen times the faces away from the lines does not cost sixteen times as much', () => {
    const ls = lines(20_000);
    timed(500, ls); // warm up
    const few = timed(500, ls);
    const many = timed(8_000, ls);
    expect(few.kept).toBe(ls.length);
    expect(many.kept).toBe(ls.length);
    expect(many.ms / Math.max(few.ms, 1)).toBeLessThan(4);
  });

  it('a line over a cut face is still cut back there, among thousands of faces', () => {
    const polygons = columns(8_000);
    const over: DrawingLine = {
      line: { start: { x: 9.9, y: 0.15 }, end: { x: 10.4, y: 0.15 } },
      category: 'projection', visibility: 'visible', entityId: 1, ifcType: 'IfcBeam', modelIndex: 0, depth: 1,
    } as DrawingLine;
    const pieces = dropInsideCutFaces([over], polygons);
    // The column at x 10..10.3 covers the middle of the line: two pieces stay, either side of it.
    expect(pieces.map((p) => [Number(p.line.start.x.toFixed(3)), Number(p.line.end.x.toFixed(3))])).toEqual([[9.9, 10], [10.3, 10.4]]);
  });
});
