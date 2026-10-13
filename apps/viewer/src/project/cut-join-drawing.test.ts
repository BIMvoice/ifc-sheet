/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A plan's walls meeting at a corner draw no line at the joint, both ways a
 * drawing is drawn (its cut faces and its cut lines); a column against them
 * keeps its own outline; a view can turn joining off.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D, DrawingLine, DrawingPolygon } from '@ifc-lite/drawing-2d';
import { joinCuts } from './cut-join-drawing.js';
import { categoryOf, styledDrawing } from './view-graphics.js';

const rect = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const face = (entityId: number, ifcType: string, outer: { x: number; y: number }[]): DrawingPolygon => ({ polygon: { outer, holes: [] }, entityId, ifcType, modelIndex: 0, isCut: true });
const outline = (p: DrawingPolygon): DrawingLine[] => p.polygon.outer.map((start, i) => ({
  line: { start, end: p.polygon.outer[(i + 1) % p.polygon.outer.length] }, category: 'cut', visibility: 'visible', entityId: p.entityId, ifcType: p.ifcType, modelIndex: 0, depth: 0,
}));

function plan(): Drawing2D {
  const faces = [face(1, 'IfcWall', rect(0, 0, 5, 0.3)), face(2, 'IfcWallStandardCase', rect(4.7, 0.3, 5, 4)), face(3, 'IfcColumn', rect(2, 0.3, 2.4, 0.7))];
  return {
    cutPolygons: faces, lines: faces.flatMap(outline), projectionPolygons: [],
    bounds: { min: { x: 0, y: 0 }, max: { x: 5, y: 4 } },
  } as unknown as Drawing2D;
}

/** Whether a cut line runs along the joint between the two walls (y = 0.3, 4.7 < x < 5). */
const jointDrawn = (lines: readonly DrawingLine[]) => lines.some((l) => l.category === 'cut' && l.line.start.y === 0.3 && l.line.end.y === 0.3
  && Math.min(l.line.start.x, l.line.end.x) < 4.85 && Math.max(l.line.start.x, l.line.end.x) > 4.85);

describe('joinCuts', () => {
  it('draws the two walls as one face with no line at the joint', () => {
    const joined = joinCuts(plan(), categoryOf);
    const walls = joined.cutPolygons.filter((p) => p.ifcType !== 'IfcColumn');
    assert.equal(walls.length, 1);
    assert.equal(walls[0].polygon.outer.length, 6);
    assert.ok(jointDrawn(plan().lines), 'the joint is there before');
    assert.ok(!jointDrawn(joined.lines), 'and gone after');
  });

  it('hides a joined wall\'s own projected edge along the joint, and keeps one outside the cut', () => {
    const d = plan();
    const projection = (entityId: number, x0: number, y0: number, x1: number, y1: number): DrawingLine => ({
      line: { start: { x: x0, y: y0 }, end: { x: x1, y: y1 } }, category: 'projection', visibility: 'visible', entityId, ifcType: 'IfcWall', modelIndex: 0, depth: 1,
    });
    d.lines.push(projection(1, 4.7, 0.15, 5, 0.15), projection(1, 1, 2, 3, 2));
    const joined = joinCuts(d, categoryOf);
    assert.ok(!joined.lines.some((l) => l.category === 'projection' && l.line.start.y === 0.15), 'under the joined face');
    assert.ok(joined.lines.some((l) => l.category === 'projection' && l.line.start.y === 2), 'outside it');
  });

  it('keeps the column a face of its own, outline and all', () => {
    const joined = joinCuts(plan(), categoryOf);
    const column = joined.cutPolygons.filter((p) => p.ifcType === 'IfcColumn');
    assert.equal(column.length, 1);
    assert.equal(joined.lines.filter((l) => l.entityId === 3).length, 4);
  });

  it('joins only walls of one material: a brick wall against a concrete one keeps its line', () => {
    const material = (p: DrawingPolygon) => (p.entityId === 1 ? 'brick' : 'concrete');
    const joined = joinCuts(plan(), categoryOf, material);
    assert.equal(joined.cutPolygons.filter((p) => p.ifcType !== 'IfcColumn').length, 2);
    assert.ok(jointDrawn(joined.lines));
  });

  it('is the same drawing when nothing meets', () => {
    const apart = { ...plan(), cutPolygons: [face(1, 'IfcWall', rect(0, 0, 1, 0.3)), face(2, 'IfcWall', rect(3, 0, 4, 0.3))] } as Drawing2D;
    assert.equal(joinCuts(apart, categoryOf), apart);
  });

  it('is on in a view by default, and a view can turn it off', () => {
    assert.ok(!jointDrawn(styledDrawing(plan(), undefined).lines));
    assert.ok(jointDrawn(styledDrawing(plan(), { joinCuts: false }).lines));
  });
});
