/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GraphicOverrideEngine, type Drawing2D } from '@ifc-lite/drawing-2d';
import { cutHatches, DEFAULT_VIEW_PRESET, styledDrawing, viewOverrideRules } from './view-graphics';

const square = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
const drawing = {
  cutPolygons: [
    { entityId: 1, ifcType: 'IfcWall', polygon: { outer: square, holes: [] } },
    { entityId: 2, ifcType: 'IfcDoor', polygon: { outer: square, holes: [] } },
  ],
  lines: [{ entityId: 2, ifcType: 'IfcDoor' }, { entityId: 3, ifcType: 'IfcSlab' }],
} as unknown as Drawing2D;

describe('view graphics', () => {
  it('takes the rules of the view\'s preset; the default one (IFC materials) and none have none', () => {
    assert.equal(DEFAULT_VIEW_PRESET, 'preset-3d-colors');
    assert.equal(viewOverrideRules(undefined).length, 0);
    assert.equal(viewOverrideRules({ presetId: null }).length, 0);
    assert.ok(viewOverrideRules({ presetId: 'preset-architectural' }).length > 0);
  });

  it('adds a winning rule per overridden category', () => {
    const rules = viewOverrideRules({ presetId: null, categories: { walls: { lineColor: '#ff0000', lineWeight: 'heavy' } } });
    const engine = new GraphicOverrideEngine(rules);
    const wall = engine.applyOverrides({ expressId: 1, ifcType: 'IfcWall' });
    const slab = engine.applyOverrides({ expressId: 3, ifcType: 'IfcSlab' });
    assert.equal(wall.style.strokeColor.toLowerCase(), '#ff0000');
    assert.ok(wall.style.lineWeight > slab.style.lineWeight);
  });

  it('hides categories and stamps cut fills, leaving the drawing alone otherwise', () => {
    assert.equal(styledDrawing(drawing, { presetId: null }), drawing);
    const shown = styledDrawing(drawing, { categories: { doors: { visible: false }, walls: { fillColor: '#00ff00' } } });
    assert.deepEqual(shown.cutPolygons.map((p) => p.ifcType), ['IfcWall']);
    assert.deepEqual(shown.cutPolygons[0].color, [0, 1, 0, 1]);
    assert.deepEqual(shown.lines.map((l) => l.ifcType), ['IfcSlab']);
  });

  it('gives a layer part its host\'s category', () => {
    const parts = { ...drawing, cutPolygons: [{ entityId: 9, ifcType: 'IfcBuildingElementPart', polygon: { outer: square, holes: [] } }] } as unknown as Drawing2D;
    const shown = styledDrawing(parts, { categories: { walls: { fillColor: '#0000ff' } } }, (id) => (id === 9 ? 'IfcWall' : null));
    assert.equal(shown.cutPolygons[0].ifcType, 'IfcWall');
    assert.deepEqual(shown.cutPolygons[0].color, [0, 0, 1, 1]);
  });

  it('lists the cut faces to hatch, in the category line colour', () => {
    const hatches = cutHatches(drawing, { categories: { walls: { cutHatch: 'ANSI31', lineColor: '#123456', hatchScale: 2 } } });
    assert.equal(hatches.length, 1);
    assert.deepEqual([hatches[0].pattern, hatches[0].scale, hatches[0].color], ['ANSI31', 2, '#123456']);
  });

  it('joins like walls at a mitred corner, with no cut line on the diagonal; another material keeps its joint (#349)', () => {
    // Wall A along x and wall B along y, 0.3 m thick, both ending on the diagonal (0,0)-(0.3,0.3); wall C of another material butts into A.
    const wallA = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 0.3 }, { x: 0.3, y: 0.3 }];
    const wallB = [{ x: 0, y: 0 }, { x: 0, y: 4 }, { x: 0.3, y: 4 }, { x: 0.3, y: 0.3 }];
    const wallC = [{ x: 3, y: 0.3 }, { x: 3.2, y: 0.3 }, { x: 3.2, y: 4 }, { x: 3, y: 4 }];
    const ring = (id: number, pts: { x: number; y: number }[]) => pts.map((a, i) => ({ entityId: id, ifcType: 'IfcWall', category: 'cut', line: { start: a, end: pts[(i + 1) % pts.length] } }));
    const walls = {
      cutPolygons: [[1, wallA], [2, wallB], [3, wallC]].map(([id, outer]) => ({ entityId: id, ifcType: 'IfcWall', modelIndex: 0, polygon: { outer, holes: [] } })),
      lines: [...ring(1, wallA), ...ring(2, wallB), ...ring(3, wallC)],
    } as unknown as Drawing2D;
    const shown = styledDrawing(walls, undefined, undefined, undefined, null, null, null, undefined, (p) => (p.entityId === 3 ? 'Concrete' : 'Brick'));
    assert.equal(shown.cutPolygons.length, 2);
    const onLine = (p: { x: number; y: number }) => shown.lines.some((l) => {
      const { start: a, end: b } = l.line;
      const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
      return t >= 0 && t <= 1 && Math.hypot(a.x + t * (b.x - a.x) - p.x, a.y + t * (b.y - a.y) - p.y) < 1e-6;
    });
    assert.equal(onLine({ x: 0.15, y: 0.15 }), false, 'no line on the mitre');
    assert.equal(onLine({ x: 3.1, y: 0.3 }), true, 'concrete C against brick A keeps its joint');
    assert.equal(onLine({ x: 0, y: 2 }), true);
  });
});
