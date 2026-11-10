/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** #749: a cut face hides the projected lines behind it, and only the parts strictly inside it: those are left out, not dashed. */

import { describe, expect, it } from 'vitest';
import { dropInsideCutFaces } from './cut-face-occlusion.js';
import type { DrawingLine, DrawingPolygon } from './types.js';

/** A 0.3 m wall cut 3 m high, with a hole 1..2 m up (a face with an opening through it seen face-on). */
const face = (ifcType = 'IfcWall', holes = true): DrawingPolygon => ({
  polygon: {
    outer: [{ x: 0, y: 0 }, { x: 0.3, y: 0 }, { x: 0.3, y: 3 }, { x: 0, y: 3 }],
    holes: holes ? [[{ x: 0.1, y: 1 }, { x: 0.1, y: 2 }, { x: 0.2, y: 2 }, { x: 0.2, y: 1 }]] : [],
  },
  entityId: 1, ifcType, modelIndex: 0, isCut: true,
});

const line = (x0: number, y0: number, x1: number, y1: number, extra: Partial<DrawingLine> = {}): DrawingLine => ({
  line: { start: { x: x0, y: y0 }, end: { x: x1, y: y1 } },
  category: 'projection', visibility: 'visible', entityId: 2, ifcType: 'IfcWindow', modelIndex: 0, depth: 0.15, ...extra,
});

describe('dropInsideCutFaces (#749)', () => {
  it('leaves out a line inside the face, keeps one outside it and one on its outline', () => {
    const outside = line(1, 0, 1, 3), onOutline = line(0.3, 0.5, 0.3, 2.5);
    expect(dropInsideCutFaces([line(0.05, 0.2, 0.25, 0.2), outside, onOutline], [face()])).toEqual([outside, onOutline]);
  });

  it('leaves out a hidden line inside the face too, so no dash prints over the cut fill', () => {
    const behindSomething = line(1, 0.2, 1, 0.8, { visibility: 'hidden' });
    expect(dropInsideCutFaces([line(0.05, 0.2, 0.25, 0.2, { visibility: 'hidden' }), behindSomething], [face()])).toEqual([behindSomething]);
  });

  it('splits a line that crosses the face and keeps the pieces outside it, with the depth of each where it lies', () => {
    const out = dropInsideCutFaces([line(-1, 0.5, 1, 0.5, { depth: 0.1, depthEnd: 0.3 })], [face()]);
    expect(out.map((l) => [l.visibility, l.line.start.x, l.line.end.x])).toEqual([
      ['visible', -1, 0], ['visible', expect.closeTo(0.3, 9), 1],
    ]);
    expect(out[0].depth).toBeCloseTo(0.1, 9);
    expect(out[0].depthEnd).toBeCloseTo(0.2, 9);
    expect(out[1].depth).toBeCloseTo(0.23, 9);
    expect(out[1].depthEnd).toBeCloseTo(0.3, 9);
  });

  it('does not hide what is seen through a hole in the face', () => {
    const out = dropInsideCutFaces([line(0.15, 0.5, 0.15, 2.5)], [face()]);
    expect(out.map((l) => [l.visibility, l.line.start.y, l.line.end.y])).toEqual([['visible', 1, 2]]);
  });

  it('leaves out a line on the seam between two cut faces, solid on both sides, and keeps the outline of the two', () => {
    const layer = (x0: number, x1: number): DrawingPolygon => ({
      polygon: { outer: [{ x: x0, y: 0 }, { x: x1, y: 0 }, { x: x1, y: 3 }, { x: x0, y: 3 }], holes: [] },
      entityId: 1, ifcType: 'IfcWall', modelIndex: 0, isCut: true,
    });
    const outline = line(0, 0.5, 0, 2.5), beyond = line(0.1, 3, 0.1, 4);
    const out = dropInsideCutFaces([line(0.1, 0.5, 0.1, 2.5, { visibility: 'hidden' }), outline, line(0.1, 2, 0.1, 4)], [layer(0, 0.1), layer(0.1, 0.3)]);
    expect(out).toEqual([outline, { ...beyond, depth: expect.closeTo(0.15, 9) }]);
  });

  it('finds the face on the far side of a seam that starts a rounding error past the line (house-2-storey Section A-A)', () => {
    const layer = (x0: number, x1: number): DrawingPolygon => ({
      polygon: { outer: [{ x: x0, y: 0 }, { x: x1, y: 0 }, { x: x1, y: 3 }, { x: x0, y: 3 }], holes: [] },
      entityId: 1, ifcType: 'IfcWall', modelIndex: 0, isCut: true,
    });
    expect(dropInsideCutFaces([line(0.1, 0.5, 0.1, 2.5, { visibility: 'hidden' })], [layer(0, 0.1), layer(0.1000001, 0.3)])).toEqual([]);
  });

  it('draws no sliver a hair long where a line starts just off the face: the line merger would take it for any line of its element', () => {
    const out = dropInsideCutFaces([line(-0.00005, 0.5, 1, 0.5)], [face()]);
    expect(out.map((l) => [l.line.start.x, l.line.end.x])).toEqual([[expect.closeTo(0.3, 9), 1]]);
  });

  it('leaves cut lines, lines on the plane and the faces of rooms and openings alone', () => {
    const lines = [line(0.05, 0.2, 0.25, 0.2, { category: 'cut' }), line(0.05, 0.3, 0.25, 0.3, { depth: 0 })];
    expect(dropInsideCutFaces(lines, [face()])).toEqual(lines);
    const behind = [line(0.05, 0.2, 0.25, 0.2)];
    expect(dropInsideCutFaces(behind, [face('IfcSpace', false), face('IfcOpeningElement', false)])).toEqual(behind);
  });
});
