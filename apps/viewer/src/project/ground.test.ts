/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D, DrawingLine, DrawingPolygon } from '@ifc-lite/drawing-2d';
import { drawingWithGround, EARTH_TONE, GROUND_OVERHANG_M } from './ground.js';

const line = (x0: number, y0: number, x1: number, y1: number, ifcType: string, entityId: number, category: DrawingLine['category'] = 'projection'): DrawingLine => ({
  line: { start: { x: x0, y: y0 }, end: { x: x1, y: y1 } }, category, visibility: 'visible', entityId, ifcType, modelIndex: 0, depth: 0,
});
const rect = (x0: number, y0: number, x1: number, y1: number, ifcType: string, entityId: number): DrawingPolygon => ({
  polygon: { outer: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], holes: [] }, entityId, ifcType, modelIndex: 0, isCut: true,
  color: [0, 0.6, 0, 1],
});
const box = (ifcType: string, id: number, x0: number, y0: number, x1: number, y1: number, cat: DrawingLine['category'] = 'projection') =>
  [line(x0, y0, x1, y0, ifcType, id, cat), line(x1, y0, x1, y1, ifcType, id, cat), line(x1, y1, x0, y1, ifcType, id, cat), line(x0, y1, x0, y0, ifcType, id, cat)];

const close = (xs: number[]) => xs.map((x) => Math.round(x * 1e9) / 1e9);

/** A 4 x 3 house standing on a 20 wide, 1 deep slab of ground whose top is at y = 0. */
function scene(groundType = 'IfcSite'): Drawing2D {
  const lines = [...box('IfcWall', 1, 0, 0, 4, 3), ...box(groundType, 2, -8, -1, 12, 0)];
  return { lines, cutPolygons: [rect(-8, -1, 12, 0, groundType, 2)], projectionPolygons: [], bounds: { min: { x: -8, y: -1 }, max: { x: 12, y: 3 } } } as unknown as Drawing2D;
}

describe('the ground in an elevation', () => {
  it('is one heavy line at the top of the terrain and nothing below it', () => {
    const d = drawingWithGround(scene(), 'elevation');
    const ground = d.lines.filter((l) => l.ifcType === 'IfcSite');
    assert.equal(ground.length, 1);
    assert.equal(ground[0].category, 'silhouette');
    assert.deepEqual([ground[0].line.start.y, ground[0].line.end.y], [0, 0]);
    assert.equal(d.cutPolygons.length, 0);
    assert.equal(d.bounds.min.y, 0);
  });

  it('stops the ground line just past the building, so a wide hill does not widen the drawing (#648)', () => {
    // The house is 0..4; the scene's ground runs -8..12. The drawing, and so its viewport and the marks beside it, is the house plus the overhang.
    const d = drawingWithGround(scene(), 'elevation');
    const ground = d.lines.filter((l) => l.ifcType === 'IfcSite');
    assert.deepEqual(close([ground[0].line.start.x, ground[0].line.end.x].sort((a, b) => a - b)), [-GROUND_OVERHANG_M, 4 + GROUND_OVERHANG_M]);
    assert.deepEqual(close([d.bounds.min.x, d.bounds.max.x]), [-GROUND_OVERHANG_M, 4 + GROUND_OVERHANG_M]);
  });

  it('keeps a ground line that is already narrower than the building, and a sloping line cut at the overhang keeps its slope', () => {
    const d = scene();
    d.lines = [...box('IfcWall', 1, 0, 0, 4, 3), line(-8, 0, 12, 4, 'IfcSite', 2)];
    const [g] = drawingWithGround(d, 'elevation').lines.filter((l) => l.ifcType === 'IfcSite');
    assert.deepEqual(close([g.line.start.x, g.line.end.x].sort((a, b) => a - b)), [-GROUND_OVERHANG_M, 4 + GROUND_OVERHANG_M]);
    assert.ok(Math.abs((g.line.end.y - g.line.start.y) / (g.line.end.x - g.line.start.x) - 0.2) < 1e-9);
  });

  it('draws nothing of the building below the ground line', () => {
    const d = scene();
    d.lines = [...box('IfcWall', 1, 0, -0.4, 4, 3), ...box('IfcSite', 2, -8, -1, 12, 0)];
    const lines = drawingWithGround(d, 'elevation').lines.filter((l) => l.ifcType === 'IfcWall');
    assert.equal(lines.every((l) => l.line.start.y >= -1e-9 && l.line.end.y >= -1e-9), true);
    assert.equal(lines.length, 3, 'the bottom edge is gone, the two sides are cut at the ground, the top stays');
  });

  it('takes the highest edge of a sloping terrain', () => {
    const d = scene();
    d.lines = [line(-8, 0, 0, 1, 'IfcSite', 2), line(0, 1, 12, 1, 'IfcSite', 2), line(-8, -1, 12, -1, 'IfcSite', 2), line(-8, -1, -8, 0, 'IfcSite', 2)];
    const top = drawingWithGround(d, 'elevation').lines;
    assert.equal(top.length, 2);
    assert.equal(top.every((l) => l.line.start.y >= 0), true);
  });

  it('treats a wide geographic element as terrain and a narrow one (a tree) as an element', () => {
    assert.equal(drawingWithGround(scene('IfcGeographicElement'), 'elevation').cutPolygons.length, 0);
    const tree = scene();
    tree.lines = [...box('IfcWall', 1, 0, 0, 4, 3), ...box('IfcGeographicElement', 3, 5, 0, 6, 2)];
    tree.cutPolygons = [];
    assert.equal(drawingWithGround(tree, 'elevation'), tree);
  });

  it('leaves a model with no ground as it was', () => {
    const d = scene(); d.lines = d.lines.filter((l) => l.ifcType === 'IfcWall'); d.cutPolygons = [];
    assert.equal(drawingWithGround(d, 'elevation'), d);
    assert.equal(drawingWithGround(d, 'section'), d);
  });
});

describe('the ground in a section', () => {
  it('is cut in an earth tone and ends a short way under the building, not at the bottom of the slab', () => {
    const d = scene();
    d.lines = [...box('IfcWall', 1, 0, 0, 4, 3, 'cut'), ...box('IfcSite', 2, -8, -10, 12, 0, 'cut')];
    d.cutPolygons = [rect(-8, -10, 12, 0, 'IfcSite', 2)];
    const s = drawingWithGround(d, 'section');
    const ys = s.cutPolygons[0].polygon.outer.map((p) => p.y);
    assert.equal(Math.max(...ys), 0);
    assert.ok(Math.min(...ys) > -1 && Math.min(...ys) < 0, `bottom ${Math.min(...ys)}`);
    assert.deepEqual(s.cutPolygons[0].color, EARTH_TONE);
    // The outline closes along the new bottom edge and nothing is left below it.
    const floor = Math.min(...ys);
    const mine = s.lines.filter((l) => l.ifcType === 'IfcSite');
    assert.equal(mine.every((l) => l.line.start.y >= floor - 1e-9 && l.line.end.y >= floor - 1e-9), true);
    assert.equal(mine.some((l) => l.line.start.y === floor && l.line.end.y === floor), true);
    assert.equal(s.bounds.min.y, floor);
  });
});
