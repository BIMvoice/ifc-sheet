/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D, DrawingLine } from '@ifc-lite/drawing-2d';
import { drawingAsViewShows, viewShowsHidden } from './view-appearance.js';

const line = (x0: number, y0: number, x1: number, y1: number, extra: Partial<DrawingLine> = {}): DrawingLine => ({
  line: { start: { x: x0, y: y0 }, end: { x: x1, y: y1 } }, category: 'projection', visibility: 'visible',
  entityId: 1, ifcType: 'IfcWall', modelIndex: 0, depth: 0, ...extra,
});

/** A 4 x 3 box, a window inside it, one hidden line inside, and the ground below. */
function house(): Drawing2D {
  const walls = [line(0, 0, 4, 0), line(4, 0, 4, 3), line(4, 3, 0, 3), line(0, 3, 0, 0)];
  const window = [line(1, 1, 2, 1), line(2, 1, 2, 2), line(2, 2, 1, 2), line(1, 2, 1, 1)];
  const hidden = line(2.5, 0.5, 3.5, 0.5, { visibility: 'hidden' });
  const ground = line(-3, 0, 7, 0, { ifcType: 'IfcSite' });
  return { lines: [...walls, ...window, hidden, ground], cutPolygons: [] } as unknown as Drawing2D;
}

describe('what an elevation shows', () => {
  it('draws no hidden lines unless the view asks for them', () => {
    assert.equal(viewShowsHidden({ kind: 'elevation' }), false);
    assert.equal(viewShowsHidden({ kind: 'section' }), true);
    assert.equal(drawingAsViewShows(house(), { kind: 'elevation' }).lines.some((l) => l.visibility === 'hidden'), false);
    assert.equal(drawingAsViewShows(house(), { kind: 'elevation', showHidden: true }).lines.some((l) => l.visibility === 'hidden'), true);
  });

  it('leaves a section as it was generated', () => {
    const drawing = house();
    assert.equal(drawingAsViewShows(drawing, { kind: 'section' }), drawing);
  });

  it('makes the building outline heavier than the lines inside it', () => {
    const lines = drawingAsViewShows(house(), { kind: 'elevation' }).lines;
    const heavy = lines.filter((l) => l.category === 'silhouette');
    assert.equal(heavy.length, 4);
    assert.equal(heavy.every((l) => l.ifcType === 'IfcWall' && l.line.start.x >= 0 && l.line.start.x <= 4 && (l.line.start.y === 0 || l.line.start.y === 3 || l.line.start.x === 0 || l.line.start.x === 4)), true);
    // The window frame is inside the walls, the ground is not the building.
    assert.equal(lines.filter((l) => l.ifcType === 'IfcSite').every((l) => l.category === 'projection'), true);
    assert.equal(lines.filter((l) => l.line.start.x >= 1 && l.line.start.x <= 2 && l.line.start.y >= 1 && l.line.end.y <= 2).every((l) => l.category === 'projection'), true);
  });
});
