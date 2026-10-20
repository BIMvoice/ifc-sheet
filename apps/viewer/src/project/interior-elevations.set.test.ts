/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Interior elevations beside the drawing set (PR #120 review):
 *  - they hang in a series of their own (A-4xx), so rescaling the facade
 *    elevations (A-2xx) leaves their sheet alone;
 *  - made first on a fresh project, they do not stop the starting set from
 *    laying out;
 *  - "What is missing" does not ask them for level marks, and they get no
 *    facade ground line.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Drawing2D, DrawingLine } from '@ifc-lite/drawing-2d';
import { viewsWithoutLevelMarks } from '@/check/findings';
import type { CheckInput } from '@/check/types';
import { resetProject, useProjectStore } from './project-store.js';
import { sheetGroup, type ModelExtent } from './drawing-set.js';
import { groupScale, setGroupScale, startDrawingSet } from './drawing-set-actions.js';
import { addInteriorElevations } from './interior-elevation-actions.js';
import { interiorElevationViews } from './interior-elevations.js';
import { drawingAsViewShows } from './view-appearance.js';

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
const room = () => interiorElevationViews({ guid: 'G-ROOM', label: '1 Hall', ring: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }], floor: 0, top: 2.5 });
const interiorSheets = () => useProjectStore.getState().sheets.filter((s) => (s.viewports ?? []).some((vp) => useProjectStore.getState().views.some((v) => v.id === vp.viewId && v.kind === 'elevation' && v.interior)));

beforeEach(() => resetProject());

describe('interior elevations have a sheet series of their own', () => {
  it('numbers their sheet A-401, in the interiors group, after the set\'s elevations', () => {
    startDrawingSet(null, HOUSE);
    const { sheetNumber } = addInteriorElevations('1 Hall', room());
    assert.equal(sheetNumber, 'A-401');
    assert.equal(sheetGroup({ number: sheetNumber }), 'interiors');
    assert.equal(addInteriorElevations('2 Store', room()).sheetNumber, 'A-402');
  });

  it('keeps its scale when the facade elevations are rescaled, and rescales with its own group', () => {
    startDrawingSet(null, HOUSE);
    addInteriorElevations('1 Hall', room());
    const before = interiorSheets()[0];
    setGroupScale('elevations', 200, HOUSE);
    assert.equal(groupScale('elevations'), 200);
    assert.equal(interiorSheets()[0], before, 'the interior sheet is untouched');
    setGroupScale('interiors', 20, HOUSE);
    assert.deepEqual(new Set(interiorSheets()[0].viewports?.map((vp) => vp.scale)), new Set([20]));
    assert.equal(groupScale('elevations'), 200);
  });
});

describe('the starting set on a project whose first sheet is interior elevations', () => {
  it('still lays out, beside the interior sheet', () => {
    const { sheetId } = addInteriorElevations('1 Hall', room());
    assert.equal(startDrawingSet(null, HOUSE), true);
    const numbers = useProjectStore.getState().sheets.map((s) => s.number);
    assert.deepEqual(numbers, ['A-401', 'A-101', 'A-201', 'A-202', 'A-301']);
    assert.ok(useProjectStore.getState().sheets.some((s) => s.id === sheetId), 'the interior sheet stays');
    // The facade elevations are made, not taken from the room's interior views.
    const facades = useProjectStore.getState().views.filter((v) => v.kind === 'elevation' && !v.interior);
    assert.equal(facades.length, 4);
    assert.equal(startDrawingSet(null, HOUSE), false, 'and only once');
  });
});

describe('interior views and the set\'s checks', () => {
  it('"What is missing" asks a facade elevation for level marks, not an interior one', () => {
    startDrawingSet(null, HOUSE);
    addInteriorElevations('1 Hall', room());
    const { views, sheets } = useProjectStore.getState();
    const input = { views, sheets, drafts: [], titleBlock: {}, projectName: '', planElements: () => [], elementExists: () => true } as unknown as CheckInput;
    const flagged = new Set(viewsWithoutLevelMarks(input).map((f) => f.viewId));
    const interior = views.filter((v) => v.kind === 'elevation' && v.interior);
    assert.equal(interior.length, 4);
    for (const v of interior) assert.ok(!flagged.has(v.id), `${v.name} is not flagged`);
    for (const v of views.filter((x) => x.kind === 'elevation' && !x.interior)) assert.ok(flagged.has(v.id), `${v.name} is still flagged`);
  });

  it('draws no facade ground line on an interior elevation', () => {
    const line = (x0: number, y0: number, x1: number, y1: number, extra: Partial<DrawingLine> = {}): DrawingLine => ({
      line: { start: { x: x0, y: y0 }, end: { x: x1, y: y1 } }, category: 'projection', visibility: 'visible', entityId: 1, ifcType: 'IfcWall', modelIndex: 0, depth: 0, ...extra,
    });
    // Terrain behind the wall at 1 m, and a wall edge running from the floor up.
    const drawing = { lines: [line(0.5, 0, 0.5, 2.5), line(-3, 1, 7, 1, { ifcType: 'IfcSite', entityId: 99 })], cutPolygons: [] } as unknown as Drawing2D;
    const [view] = room();
    const facade = drawingAsViewShows(drawing, { kind: 'elevation' });
    assert.ok(facade.lines.some((l) => l.ifcType === 'IfcSite' && l.category === 'silhouette'), 'a facade elevation draws the ground line');
    const shown = drawingAsViewShows(drawing, { kind: 'elevation', interior: { ...view.interior, crop: { min: { x: 0, y: 0 }, max: { x: 4, y: 2.5 } } } });
    assert.ok(!shown.lines.some((l) => l.ifcType === 'IfcSite' && l.category === 'silhouette'), 'no heavy ground line');
    const wall = shown.lines.find((l) => l.entityId === 1);
    assert.deepEqual([wall?.line.start.y, wall?.line.end.y], [0, 2.5], 'nothing of the room is cut away below the terrain');
  });
});
