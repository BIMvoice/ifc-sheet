/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** #749: a cut face hides the projected lines behind it, and only the parts strictly inside it. */

import { describe, expect, it } from 'vitest';
import { hideBehindCutFaces } from './cut-face-occlusion.js';
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

describe('hideBehindCutFaces (#749)', () => {
  it('hides a line inside the face, keeps one outside it and one on its outline', () => {
    const out = hideBehindCutFaces([line(0.05, 0.2, 0.25, 0.2), line(1, 0, 1, 3), line(0.3, 0.5, 0.3, 2.5)], [face()]);
    expect(out.map((l) => l.visibility)).toEqual(['hidden', 'visible', 'visible']);
  });

  it('splits a line that crosses the face, with the depth of each piece where it lies', () => {
    const out = hideBehindCutFaces([line(-1, 0.5, 1, 0.5, { depth: 0.1, depthEnd: 0.3 })], [face()]);
    expect(out.map((l) => [l.visibility, l.line.start.x, l.line.end.x])).toEqual([
      ['visible', -1, 0], ['hidden', 0, expect.closeTo(0.3, 9)], ['visible', expect.closeTo(0.3, 9), 1],
    ]);
    expect(out[1].depth).toBeCloseTo(0.2, 9);
    expect(out[1].depthEnd).toBeCloseTo(0.23, 9);
  });

  it('does not hide what is seen through a hole in the face', () => {
    const out = hideBehindCutFaces([line(0.15, 0.5, 0.15, 2.5)], [face()]);
    expect(out.map((l) => [l.visibility, l.line.start.y, l.line.end.y])).toEqual([
      ['hidden', 0.5, 1], ['visible', 1, 2], ['hidden', 2, 2.5],
    ]);
  });

  it('leaves cut lines, lines on the plane, overhead lines and the faces of rooms and openings alone', () => {
    const lines = [line(0.05, 0.2, 0.25, 0.2, { category: 'cut' }), line(0.05, 0.3, 0.25, 0.3, { depth: 0 }), line(0.05, 0.4, 0.25, 0.4, { visibility: 'hidden' })];
    expect(hideBehindCutFaces(lines, [face()])).toEqual(lines);
    const behind = [line(0.05, 0.2, 0.25, 0.2)];
    expect(hideBehindCutFaces(behind, [face('IfcSpace', false), face('IfcOpeningElement', false)])).toEqual(behind);
  });
});
