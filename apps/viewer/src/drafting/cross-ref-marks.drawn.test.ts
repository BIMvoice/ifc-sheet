/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ElevationDirection, ProjectSheet, ProjectView } from '@/project/types';
import { textBox } from './annotation';
import { screenSigns } from './frame';
import { readableDeg } from './styles';
import { elevationMarkDrafts, type Box } from './cross-ref-marks';
import type { DraftEntity, Pt } from './types';

/**
 * Audit #245: on the Schependomlaan plan the west elevation label "2 / A-202"
 * printed over the section reference "1 / A-301". The mark was placed clear of
 * it, but where the label is DRAWN is not where its box is: the plan draws a
 * text turned a quarter turn the other way round (`readableDeg` folds a
 * top-to-bottom reading into bottom-to-top, about the anchor), so the drawn
 * text lay a whole label length from the box the placement had kept clear.
 */

const FOOTPRINT = { min: { x: 100, y: 200 }, max: { x: 112, y: 210 } };
const elevation = (direction: ElevationDirection): ProjectView => ({ id: `e-${direction}`, kind: 'elevation', name: direction, direction, createdAt: 0 });
const views = (['north', 'east', 'south', 'west'] as const).map(elevation);
const sheets: ProjectSheet[] = [
  { id: 's1', number: 'A-201', name: 'South and north', createdAt: 0, viewports: [
    { id: 'v1', viewId: 'e-south', x: 100, y: 100, scale: 100, width: 0, height: 0, center: null },
    { id: 'v2', viewId: 'e-north', x: 300, y: 100, scale: 100, width: 0, height: 0, center: null },
  ] },
  { id: 's2', number: 'A-202', name: 'East and west', createdAt: 0, viewports: [
    { id: 'v3', viewId: 'e-east', x: 100, y: 100, scale: 100, width: 0, height: 0, center: null },
    { id: 'v4', viewId: 'e-west', x: 300, y: 100, scale: 100, width: 0, height: 0, center: null },
  ] },
];

/** The angle a plan (drawing y down the screen) draws a text turned `rotation` at, as `AnnotationGraphics` computes it. */
function drawnRotation(rotation: number): number {
  const { kx, ky } = screenSigns('down');
  const deg = readableDeg((Math.atan2(Math.sin(rotation) * ky, Math.cos(rotation) * kx) * 180) / Math.PI);
  return (deg * Math.PI) / 180 * ky; // back to a drawing angle: a plan has ky 1
}
const extent = (pts: Pt[]) => ({ x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), y1: Math.max(...pts.map((p) => p.y)) });

const marks = (): DraftEntity[] => elevationMarkDrafts({ planViewId: 'plan', layerId: '0', views, sheets, bounds: FOOTPRINT, paperUnit: 0.1, factor: 1 });

describe('an elevation label is drawn where its box is (#245)', () => {
  for (const direction of ['east', 'west'] as const) {
    it(`${direction}: the plan draws the label at the angle it is stored at, so it is not turned about its anchor`, () => {
      const label = marks().find((m) => m.id.includes(`e-${direction}`) && m.shape.type === 'text');
      assert.ok(label && label.shape.type === 'text');
      const stored = extent(textBox(label.shape.p, label.shape.text, label.shape.height, label.shape.rotation));
      const drawn = extent(textBox(label.shape.p, label.shape.text, label.shape.height, drawnRotation(label.shape.rotation)));
      for (const k of ['x0', 'x1', 'y0', 'y1'] as const) assert.ok(Math.abs(stored[k] - drawn[k]) < 1e-6, `${direction}: ${k} ${stored[k]} is drawn at ${drawn[k]}`);
    });

    it(`${direction}: a reference where the label is DRAWN is kept clear of, not only where its box is`, () => {
      const at = (obstacles: Box[]) => {
        const made = elevationMarkDrafts({ planViewId: 'plan', layerId: '0', views, sheets, bounds: FOOTPRINT, paperUnit: 0.1, factor: 1, obstacles });
        const label = made.find((m) => m.id.includes(`e-${direction}`) && m.shape.type === 'text');
        assert.ok(label && label.shape.type === 'text');
        return extent(textBox(label.shape.p, label.shape.text, label.shape.height, drawnRotation(label.shape.rotation)));
      };
      // Where the label is drawn with nothing in its way; a section reference of the same width stands in the middle of that.
      const free = at([]);
      const ref: Box = { x0: free.x0, x1: free.x1, y0: free.y0 + 0.4, y1: free.y1 - 0.4 };
      const drawn = at([ref]);
      assert.ok(!(drawn.x0 < ref.x1 && drawn.x1 > ref.x0 && drawn.y0 < ref.y1 && drawn.y1 > ref.y0), `the label as drawn ${JSON.stringify(drawn)} lies on the reference ${JSON.stringify(ref)}`);
    });
  }
});
