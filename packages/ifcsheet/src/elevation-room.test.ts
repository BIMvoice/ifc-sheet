/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #648: a facade elevation is drawn with the ground around the building (IfcOpenHouse's hill is about 21 m wide, its
 * building 5.8 m), so the set, laid out on the building, must also cut each elevation to the room it reserved: two
 * viewports side by side, inside the frame, not overlapping, at the scale the sheet states, the building centred in
 * its box whatever the ground does. The extent is IfcOpenHouse_IFC4.ifc's, as `openModel` measures it.
 */

import { describe, expect, it } from 'vitest';
import { buildDrawingSet, drawingArea, viewCentre, type ModelExtent } from './drawing-set.js';
import { relaySheet, sheetIsAsLaid } from './sheet-relayout.js';
import type { ElevationDirection, ProjectView } from './document.js';

const OPEN_HOUSE: ModelExtent = { min: { x: -5.1, y: -2, z: -5.4 }, max: { x: 5.55, y: 5.78, z: 0.4 } };
const elevation = (direction: ElevationDirection): ProjectView => ({ id: direction, name: direction, createdAt: 0, kind: 'elevation', direction, planeOffset: 0 } as ProjectView);
const views = (['south', 'north', 'east', 'west'] as const).map(elevation);

describe('elevations are cut to the room the layout reserved (#648)', () => {
  const sheets = buildDrawingSet({ views, extent: OPEN_HOUSE });
  const eastWest = sheets.find((s) => s.viewports?.some((vp) => vp.viewId === 'east')) as (typeof sheets)[number];

  it('lays east and west side by side inside the frame without overlapping, at the shared scale', () => {
    const area = drawingArea(eastWest);
    const boxes = (eastWest.viewports ?? []).map((vp) => ({ vp, left: vp.x - vp.width / 2, right: vp.x + vp.width / 2, top: vp.y - vp.height / 2, bottom: vp.y + vp.height / 2 }));
    expect(boxes).toHaveLength(2);
    for (const b of boxes) {
      expect(b.vp.width, 'a box, so the ground around the building cannot widen it').toBeGreaterThan(0);
      expect(b.left).toBeGreaterThanOrEqual(area.x);
      expect(b.right).toBeLessThanOrEqual(area.x + area.w);
      expect(b.top).toBeGreaterThanOrEqual(area.y);
      expect(b.bottom).toBeLessThanOrEqual(area.y + area.h);
      expect(b.vp.scale).toBe(100);
    }
    expect(boxes[0].right).toBeLessThanOrEqual(boxes[1].left);
  });

  it('keeps the drawing true to scale: the box is the building at its scale plus a margin, not a squeezed ground', () => {
    const south = sheets.flatMap((s) => s.viewports ?? []).find((vp) => vp.viewId === 'south');
    expect(south?.width).toBeCloseTo((OPEN_HOUSE.max.x - OPEN_HOUSE.min.x) * 10 + 20, 6);
    expect(south?.height).toBeCloseTo((OPEN_HOUSE.max.y - OPEN_HOUSE.min.y) * 10 + 20, 6);
  });

  it('centres each elevation on the building, in the drawing\'s own coordinates (north and west look from the far side)', () => {
    const at = (d: ElevationDirection) => viewCentre(elevation(d), OPEN_HOUSE) as { x: number; y: number };
    expect(at('south').x).toBeCloseTo(0.225, 9);
    expect(at('north').x).toBeCloseTo(-0.225, 9);
    expect(at('east').x).toBeCloseTo(-2.5, 9);
    expect(at('west').x).toBeCloseTo(2.5, 9);
    expect(at('south').y).toBeCloseTo(1.89, 9);
  });

  it('still reads as laid by the rule, and is laid the same again at the same scale', () => {
    expect(sheetIsAsLaid(eastWest, views, OPEN_HOUSE)).toBe(true);
    const again = relaySheet(eastWest, views, OPEN_HOUSE, 100);
    expect(again?.viewports.map((vp) => [vp.width, vp.height])).toEqual((eastWest.viewports ?? []).map((vp) => [vp.width, vp.height]));
  });

  it('leaves a section, a detail and an interior elevation to fit their drawings', () => {
    expect(viewCentre({ kind: 'section' }, OPEN_HOUSE)).toBeNull();
    expect(viewCentre({ kind: 'elevation', direction: 'south', detail: { min: { x: 0, y: 0 }, max: { x: 1, y: 1 } } }, OPEN_HOUSE)).toBeNull();
    expect(viewCentre({ kind: 'elevation', direction: 'south', interior: {} }, OPEN_HOUSE)).toBeNull();
  });
});
