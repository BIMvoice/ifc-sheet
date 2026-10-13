/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D, DrawingLine, DrawingPolygon } from '@ifc-lite/drawing-2d';
import { cropDrawing } from './drawing-crop.js';
import { drawingAsViewShows } from './view-appearance.js';

const line = (x0: number, y0: number, x1: number, y1: number): DrawingLine => ({
  line: { start: { x: x0, y: y0 }, end: { x: x1, y: y1 } }, category: 'projection', visibility: 'visible', entityId: 1, ifcType: 'IfcWall', modelIndex: 0, depth: 0,
});
const square = (x0: number, y0: number, x1: number, y1: number): DrawingPolygon => ({
  polygon: { outer: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], holes: [] }, entityId: 1, ifcType: 'IfcWall', modelIndex: 0, isCut: true,
} as DrawingPolygon);
const drawing = (): Drawing2D => ({
  lines: [line(-5, 1, 15, 1), line(20, 20, 30, 30), line(2, 2, 3, 3)],
  cutPolygons: [square(-2, -2, 4, 4), square(50, 50, 60, 60)],
  projectionPolygons: [],
  bounds: { min: { x: -5, y: -5 }, max: { x: 60, y: 60 } },
} as unknown as Drawing2D);
const R = { min: { x: 0, y: 0 }, max: { x: 10, y: 10 } };

describe('a drawing cropped to an area', () => {
  it('clips lines to it and drops what is wholly outside', () => {
    const out = cropDrawing(drawing(), R);
    assert.equal(out.lines.length, 2);
    assert.deepEqual(out.lines[0].line, { start: { x: 0, y: 1 }, end: { x: 10, y: 1 } });
    assert.deepEqual(out.lines[1].line, { start: { x: 2, y: 2 }, end: { x: 3, y: 3 } });
  });

  it('clips filled polygons to it', () => {
    const out = cropDrawing(drawing(), R);
    assert.equal(out.cutPolygons.length, 1);
    const xs = out.cutPolygons[0].polygon.outer.map((p) => p.x);
    const ys = out.cutPolygons[0].polygon.outer.map((p) => p.y);
    assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [0, 4, 0, 4]);
  });

  it('takes the area as the drawing bounds, and leaves the generated drawing alone', () => {
    const d = drawing();
    const out = cropDrawing(d, R);
    assert.deepEqual(out.bounds, R);
    assert.equal(d.lines.length, 3);
  });

  it('is what a detail view shows, and a view that is no detail shows whole', () => {
    const d = drawing();
    assert.equal(drawingAsViewShows(d, { kind: 'plan', detail: { of: 'p', ...R, number: 1 } }).lines.length, 2);
    assert.equal(drawingAsViewShows(d, { kind: 'plan' }), d);
  });
});
