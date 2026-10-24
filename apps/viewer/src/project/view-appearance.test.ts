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
  const ground = line(-3, 0, 7, 0, { ifcType: 'IfcSite', entityId: 99 });
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
    drawing.lines = drawing.lines.filter((l) => l.ifcType !== 'IfcSite');
    assert.equal(drawingAsViewShows(drawing, { kind: 'section' }), drawing);
  });

  it('makes the building outline heavier than the lines inside it', () => {
    const lines = drawingAsViewShows(house(), { kind: 'elevation' }).lines;
    const heavy = lines.filter((l) => l.category === 'silhouette' && l.ifcType !== 'IfcSite');
    assert.equal(heavy.length, 4);
    assert.equal(heavy.every((l) => l.ifcType === 'IfcWall' && l.line.start.x >= 0 && l.line.start.x <= 4 && (l.line.start.y === 0 || l.line.start.y === 3 || l.line.start.x === 0 || l.line.start.x === 4)), true);
    // The window frame is inside the walls; the ground is drawn as its own line, not as part of the building.
    assert.equal(lines.filter((l) => l.ifcType === 'IfcSite').every((l) => l.category === 'silhouette'), true);
    assert.equal(lines.filter((l) => l.line.start.x >= 1 && l.line.start.x <= 2 && l.line.start.y >= 1 && l.line.end.y <= 2).every((l) => l.category === 'projection'), true);
  });
});

describe('a discipline plan is framed on what it keeps (#257)', () => {
  const far = (id: number): Partial<DrawingLine> => ({ entityId: id, ifcType: 'IfcBuildingElementProxy' });
  /** A roof 2 x 2 at the origin and a proxy 30 m away; the generator's bounds hold both. */
  const site = (): Drawing2D => ({
    lines: [line(0, 0, 2, 0, { entityId: 5, ifcType: 'IfcSlab' }), line(2, 0, 2, 2, { entityId: 5, ifcType: 'IfcSlab' }), line(-30, -20, -28, -20, far(9))],
    cutPolygons: [],
    projectionPolygons: [],
    bounds: { min: { x: -30, y: -20 }, max: { x: 2, y: 2 } },
  } as unknown as Drawing2D);
  const dropsProxy = (_id: number, type: string | undefined) => type === 'IfcBuildingElementProxy';

  it('takes the bounds from the lines its filter leaves, not from the model', () => {
    assert.deepEqual(drawingAsViewShows(site(), { kind: 'plan', omits: dropsProxy }).bounds, { min: { x: 0, y: 0 }, max: { x: 2, y: 2 } });
  });

  it('counts the cut faces it keeps and ignores the ones it drops', () => {
    const drawing = site();
    const polygon = (id: number, type: string, x: number) => ({ polygon: { outer: [{ x, y: 0 }, { x: x + 1, y: 0 }, { x: x + 1, y: 1 }], holes: [] }, entityId: id, ifcType: type, modelIndex: 0, isCut: true });
    drawing.cutPolygons = [polygon(5, 'IfcSlab', 3), polygon(9, 'IfcBuildingElementProxy', -25)] as unknown as Drawing2D['cutPolygons'];
    assert.deepEqual(drawingAsViewShows(drawing, { kind: 'plan', omits: dropsProxy }).bounds, { min: { x: 0, y: 0 }, max: { x: 4, y: 2 } });
  });

  it('keeps the generator\'s bounds for a view that has no filter, and when the filter leaves nothing', () => {
    assert.deepEqual(drawingAsViewShows(site(), { kind: 'plan' }).bounds, site().bounds);
    assert.deepEqual(drawingAsViewShows(site(), { kind: 'plan', omits: () => true }).bounds, site().bounds);
  });
});
