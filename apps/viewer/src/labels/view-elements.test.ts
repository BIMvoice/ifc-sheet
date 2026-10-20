/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DrawingForLabels } from './view-elements.js';
import { viewElements } from './view-elements.js';

const poly = (entityId: number, pts: [number, number][]) => ({ entityId, polygon: { outer: pts.map(([x, y]) => ({ x, y })), holes: [] } }) as unknown as DrawingForLabels['cutPolygons'][number];
const rect = (id: number, x0: number, y0: number, x1: number, y1: number) => poly(id, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
const line = (entityId: number, x0: number, y0: number, x1: number, y1: number, visibility = 'visible') => ({ entityId, visibility, line: { start: { x: x0, y: y0 }, end: { x: x1, y: y1 } } }) as unknown as DrawingForLabels['lines'][number];

describe('viewElements', () => {
  it('anchors a cut element at the centre of its biggest outline', () => {
    const drawing: DrawingForLabels = { cutPolygons: [rect(7, 0, 0, 4, 1), rect(7, 10, 10, 11, 11)], projectionPolygons: [], lines: [] };
    const [e] = viewElements(drawing);
    assert.deepEqual(e.anchor, { x: 2, y: 0.5 });
    assert.deepEqual(e.ring, [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 1 }, { x: 0, y: 1 }], 'with the outline it has');
  });
  it('takes an L-shaped outline at its area centroid, not at its bounding box', () => {
    const l = poly(1, [[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4]]);
    const [e] = viewElements({ cutPolygons: [l], projectionPolygons: [], lines: [] });
    assert.ok(Math.abs(e.anchor.x - 9.5 / 7) < 1e-9 && Math.abs(e.anchor.y - 9.5 / 7) < 1e-9, JSON.stringify(e.anchor));
  });
  it('falls back to a projected outline for an element nothing cuts, and to its lines for one with no outline', () => {
    const drawing: DrawingForLabels = { cutPolygons: [rect(1, 0, 0, 2, 2)], projectionPolygons: [rect(1, 50, 50, 60, 60), rect(2, 4, 4, 6, 8)], lines: [line(3, 0, 0, 2, 0), line(3, 2, 0, 2, 6), line(4, 9, 9, 10, 10, 'hidden')] };
    const found = viewElements(drawing);
    assert.deepEqual(found.map((e) => [e.renderId, e.anchor]), [[1, { x: 1, y: 1 }], [2, { x: 5, y: 6 }], [3, { x: 1, y: 3 }]]);
    assert.deepEqual(found[2].ring, [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 6 }, { x: 0, y: 6 }], 'a lines-only element has the box round its lines');
  });
  it('stands in for an outline of many points by its convex hull', () => {
    const arc = Array.from({ length: 80 }, (_, i): [number, number] => [Math.cos((i / 80) * 2 * Math.PI), Math.sin((i / 80) * 2 * Math.PI)]);
    const [e] = viewElements({ cutPolygons: [poly(1, arc)], projectionPolygons: [], lines: [] });
    assert.equal(e.ring.length, 24, 'a round column is thinned, not kept at 80 points');
  });
  it('ignores a degenerate outline', () => {
    assert.deepEqual(viewElements({ cutPolygons: [poly(1, [[0, 0], [1, 1], [2, 2]])], projectionPolygons: [], lines: [] }), []);
  });
});
