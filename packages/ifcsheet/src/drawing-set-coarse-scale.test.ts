/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A model too large for A0 at 1:200 (an OSArch user's L-shaped site, 2026-11): the set stopped at 1:200, so every plan
 * overran its sheet and the viewport, centred on the model, showed the empty inside of the L. The set now goes on down
 * the offered scales to the first one its drawings fit at, and the sheet says why it is that coarse.
 */

import { describe, expect, it } from 'vitest';
import { sheetScaleReason } from './scale-reason.js';
import { SET_SCALES, buildDrawingSet, drawingArea, fitsScale, groupsThatDoNotFit, sheetGroup, viewExtent, type ModelExtent } from './drawing-set.js';
import { SHEET_SCALES } from './viewport-fit.js';
import type { ElevationDirection, ProjectView } from './document.js';

const elevation = (direction: ElevationDirection): ProjectView => ({ id: direction, name: direction, createdAt: 0, kind: 'elevation', direction, planeOffset: 0 } as ProjectView);
const plan = (id: string, elevationM: number): ProjectView => ({ id, name: id, createdAt: 0, kind: 'plan', level: { name: id, elevation: elevationM, storeyGlobalIds: [] }, cutHeight: 1.2 } as ProjectView);

/** An L-shaped site 400 m east-west and 300 m north-south, 12 m tall: its bounding box is what the set lays out. */
const L_SITE: ModelExtent = { min: { x: -200, y: 0, z: -150 }, max: { x: 200, y: 12, z: 150 } };
const views = [plan('p0', 0), plan('p1', 4), elevation('south'), elevation('north'), elevation('east'), elevation('west')];

describe('a model larger than A0 at 1:200 is drawn whole at a coarser scale', () => {
  const sheets = buildDrawingSet({ views, extent: L_SITE });
  const plans = sheets.filter((s) => sheetGroup(s) === 'plans');

  it('puts every plan drawing inside its sheet', () => {
    expect(plans.length).toBeGreaterThan(0);
    for (const sheet of plans) {
      const area = drawingArea(sheet);
      for (const vp of sheet.viewports ?? []) {
        const size = viewExtent(views.find((v) => v.id === vp.viewId) as ProjectView, L_SITE);
        const k = 1000 / vp.scale;
        const box = { x0: vp.x - (size.w * k) / 2, x1: vp.x + (size.w * k) / 2, y0: vp.y - (size.h * k) / 2, y1: vp.y + (size.h * k) / 2 };
        expect(box.x0, `${sheet.number} ${vp.viewId} left`).toBeGreaterThanOrEqual(area.x);
        expect(box.x1, `${sheet.number} ${vp.viewId} right`).toBeLessThanOrEqual(area.x + area.w);
        expect(box.y0, `${sheet.number} ${vp.viewId} top`).toBeGreaterThanOrEqual(area.y);
        expect(box.y1, `${sheet.number} ${vp.viewId} bottom`).toBeLessThanOrEqual(area.y + area.h);
      }
    }
  });

  it('draws the plans at the most detailed offered scale they fit at, coarser than 1:200', () => {
    for (const sheet of plans) {
      const sizes = (sheet.viewports ?? []).map((vp) => viewExtent(views.find((v) => v.id === vp.viewId) as ProjectView, L_SITE));
      const best = SHEET_SCALES.find((s) => fitsScale(sizes, drawingArea(sheet), s));
      expect(sheet.paper).toBe('A0');
      expect(best).toBeGreaterThan(SET_SCALES[SET_SCALES.length - 1]);
      expect((sheet.viewports ?? []).map((vp) => vp.scale)).toEqual(sizes.map(() => best));
    }
  });

  it('says on the sheet that the drawings are too large for 1:200, and leaves no "does not fit" note', () => {
    for (const sheet of plans) {
      const reason = sheetScaleReason(sheet, views, L_SITE, sheets)?.reason;
      expect(reason?.key).toBe('wall.reason.coarse');
      expect(reason?.params).toMatchObject({ paper: 'A0', set: SET_SCALES[SET_SCALES.length - 1] });
    }
    expect(groupsThatDoNotFit(views, L_SITE)).toEqual([]);
  });

  it('still says so when a model is larger than A0 even at the coarsest offered scale', () => {
    const country: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 40_000, y: 12, z: 30_000 } };
    expect(groupsThatDoNotFit(views, country)).toContain('plans');
    const sheet = buildDrawingSet({ views, extent: country }).find((s) => sheetGroup(s) === 'plans');
    expect(sheet?.viewports?.[0].scale).toBe(SHEET_SCALES[SHEET_SCALES.length - 1]);
    expect(sheet && sheetScaleReason(sheet, views, country)?.reason.key).toBe('wall.reason.noFit');
  });
});
