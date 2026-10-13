/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fitViewportBox, PAPER_MM } from '@/project/sheets';
import { planDraftSet } from './plan.js';
import { appSheetSpec } from './sheet-spec.js';
import type { Box3, DraftSetInput, DraftSetPlan, PlannedSheet } from './types.js';

const box = (w: number, d: number, h: number, x0 = 0, z0 = 0): Box3 => ({ min: { x: x0, y: 0, z: z0 }, max: { x: x0 + w, y: h, z: z0 + d } });
const storeys = (n: number) => Array.from({ length: n }, (_, i) => ({ name: i === 0 ? 'Ground Floor' : `Level ${i}`, elevation: i * 3 }));
const input = (over: Partial<DraftSetInput> = {}): DraftSetInput => ({
  projectName: 'Casa Popescu', buildingName: 'Corp A', date: '2026-10-13', storeys: storeys(2), bounds: box(12, 10, 6), spec: appSheetSpec(), ...over,
});
const sheetsOf = (p: DraftSetPlan, group: PlannedSheet['group']) => p.sheets.filter((s) => s.group === group);
const paperOf = (s: PlannedSheet) => {
  const base = PAPER_MM[s.paper];
  return s.orientation === 'landscape' ? base : { w: base.h, h: base.w };
};

/** The sheet's rectangle left for drawings: inside the frame and 10 mm gap, above the title block. */
function assertInside(s: PlannedSheet): void {
  const { w, h } = paperOf(s);
  for (const v of s.viewports) {
    assert.ok(v.x - v.width / 2 >= 20 - 1e-6 && v.x + v.width / 2 <= w - 20 + 1e-6, `${s.number} x`);
    assert.ok(v.y - v.height / 2 >= 20 - 1e-6 && v.y + v.height / 2 <= h - 70 + 1e-6, `${s.number} y`);
  }
  for (let i = 1; i < s.viewports.length; i++) {
    const a = s.viewports[i - 1];
    const b = s.viewports[i];
    assert.ok(b.x - b.width / 2 - (a.x + a.width / 2) >= 10 - 1e-6, `${s.number} gap`);
  }
}

describe('planDraftSet', () => {
  it('makes a plan per storey, four elevations and two sections, on gap-free sheets A-1xx / A-2xx / A-3xx', () => {
    const p = planDraftSet(input({ storeys: storeys(3) }));
    assert.deepEqual(p.views.map((v) => v.kind), ['plan', 'plan', 'plan', 'elevation', 'elevation', 'elevation', 'elevation', 'section', 'section']);
    assert.deepEqual(p.views.filter((v) => v.kind === 'plan').map((v) => v.name), ['Ground Floor', 'Level 1', 'Level 2']);
    assert.deepEqual(p.views.filter((v) => v.kind === 'elevation').map((v) => v.name), ['North Elevation', 'East Elevation', 'South Elevation', 'West Elevation']);
    assert.deepEqual(p.views.filter((v) => v.kind === 'section').map((v) => v.name), ['Section A-A', 'Section B-B']);
    assert.deepEqual(p.sheets.map((s) => s.number), ['A-101', 'A-102', 'A-201', 'A-202', 'A-301']);
    // Every view sits on exactly one sheet.
    const placed = p.sheets.flatMap((s) => s.viewports.map((v) => v.viewKey)).sort();
    assert.deepEqual(placed, p.views.map((v) => v.key).sort());
    for (const s of p.sheets) assertInside(s);
  });

  it('fills the title block from the model and puts the date in as given', () => {
    const p = planDraftSet(input());
    assert.deepEqual(p.sheets[0].titleBlock, { project: 'Casa Popescu - Corp A', date: '2026-10-13' });
    assert.deepEqual(planDraftSet(input({ buildingName: '', date: '' })).sheets[0].titleBlock, { project: 'Casa Popescu' });
  });

  it('is deterministic', () => {
    assert.deepEqual(planDraftSet(input({ storeys: storeys(4) })), planDraftSet(input({ storeys: storeys(4) })));
  });

  it('picks the largest scale at which the plans fit, and the smallest paper that reaches 1:100', () => {
    const p = planDraftSet(input());
    const plans = sheetsOf(p, 'plans')[0];
    // 12 x 10 m: 1:100 is 140 x 120 mm boxes; 1:50 needs 260 x 220 mm, which A3 (380 x 207 usable) cannot hold.
    assert.equal(plans.paper, 'A3');
    assert.equal(plans.viewports[0].scale, 100);
    assert.equal(plans.reason.key, 'draftSet.reason.both');
    assert.deepEqual(plans.reason.params, { scale: 100, paper: 'A3', kind: 'plans' });
  });

  it('puts a viewport box that equals the auto-fit box of the viewer', () => {
    const p = planDraftSet(input());
    // The second plan carries no section marks, so its box is the plain one.
    const v = sheetsOf(p, 'plans')[0].viewports[1];
    assert.equal(v.fixedBox, false);
    const fit = fitViewportBox({ min: { x: 0, y: 0 }, max: { x: 12, y: 10 } }, v.scale);
    assert.equal(v.width, fit.width);
    assert.equal(v.height, fit.height);
  });

  it('the plan with the section marks gets a fixed box that reaches past the line ends', () => {
    const p = planDraftSet(input());
    const [ground, upper] = sheetsOf(p, 'plans')[0].viewports;
    assert.equal(ground.fixedBox, true);
    assert.equal(upper.fixedBox, false);
    // 12 x 10 m plus a 1 m overhang each side at 1:100 is 140 x 120 mm, plus 10 + 25 mm of room each side.
    assert.deepEqual([ground.width, ground.height], [140 + 70, 120 + 70]);
    assert.ok(sheetsOf(p, 'elevations').every((s) => s.viewports.every((v) => !v.fixedBox)));
  });

  it('one storey: one plan on one sheet, which says it is the only one', () => {
    const p = planDraftSet(input({ storeys: storeys(1) }));
    const plans = sheetsOf(p, 'plans');
    assert.equal(plans.length, 1);
    assert.equal(plans[0].viewports.length, 1);
    assert.equal(plans[0].reason.key, 'draftSet.reason.only');
    // A lone view is centred in the usable area.
    assert.equal(plans[0].viewports[0].x, 210);
  });

  it('many storeys: plans share one scale and spill over several sheets, two a sheet, the last alone', () => {
    const p = planDraftSet(input({ storeys: storeys(5) }));
    const plans = sheetsOf(p, 'plans');
    assert.deepEqual(plans.map((s) => s.viewports.length), [2, 2, 1]);
    assert.equal(new Set(plans.flatMap((s) => s.viewports.map((v) => v.scale))).size, 1);
    assert.equal(new Set(plans.map((s) => s.paper)).size, 1);
    assert.equal(plans[2].reason.key, 'draftSet.reason.last');
    assert.deepEqual(plans.map((s) => s.number), ['A-101', 'A-102', 'A-103']);
  });

  it('a wide building that cannot sit two side by side gets one per sheet and says so', () => {
    // 28 m wide at 1:100 is 280 mm (370 with the room for the section marks on the ground plan): one fits A3 (380), two do not.
    const p = planDraftSet(input({ bounds: box(28, 8, 6), storeys: storeys(2) }));
    const plans = sheetsOf(p, 'plans');
    assert.deepEqual(plans.map((s) => s.viewports.length), [1, 1]);
    assert.equal(plans[0].paper, 'A3');
    assert.equal(plans[0].viewports[0].scale, 100);
    assert.equal(plans[0].reason.key, 'draftSet.reason.single');
  });

  it('a very long thin building goes on the paper it needs, in landscape when it is long in x', () => {
    // 80 m by 4 m: 800 mm + margins at 1:100 does not fit A1 (801 usable minus margins), so A0.
    const p = planDraftSet(input({ bounds: box(80, 4, 6), storeys: storeys(1) }));
    const s = sheetsOf(p, 'plans')[0];
    assert.deepEqual([s.paper, s.orientation, s.viewports[0].scale], ['A0', 'landscape', 100]);
    assertInside(s);
  });

  it('turns the sheet to portrait when that gives the larger scale', () => {
    // 15 m by 22 m: 240 x 310 mm at 1:100 (marks included) fits A3 portrait; landscape A3 is only 207 mm high and would need 1:200.
    const p = planDraftSet(input({ bounds: box(15, 22, 6), storeys: storeys(1) }));
    const s = sheetsOf(p, 'plans')[0];
    assert.deepEqual([s.paper, s.orientation, s.viewports[0].scale], ['A3', 'portrait', 100]);
    assertInside(s);
  });

  it('no storeys: one plan cut at mid-height, and it says so', () => {
    const p = planDraftSet(input({ storeys: [], bounds: box(12, 10, 7) }));
    const plans = p.views.filter((v) => v.kind === 'plan');
    assert.equal(plans.length, 1);
    assert.equal(plans[0].kind === 'plan' && plans[0].cutHeight, 3.5);
    assert.equal(plans[0].kind === 'plan' && plans[0].level.elevation, 0);
    assert.ok(p.notes.some((n) => n.key === 'draftSet.note.noStoreys' && n.params.height === 3.5));
    assert.equal(sheetsOf(p, 'plans').length, 1);
  });

  it('no geometry: nothing to plan, and it says so', () => {
    const p = planDraftSet(input({ bounds: null }));
    assert.deepEqual(p.views, []);
    assert.deepEqual(p.sheets, []);
    assert.deepEqual(p.notes.map((n) => n.key), ['draftSet.note.noModel']);
  });

  it('a huge site takes the largest paper and the smallest scale and reports that it still does not fit', () => {
    const p = planDraftSet(input({ bounds: box(2500, 2000, 40), storeys: storeys(1) }));
    const s = sheetsOf(p, 'plans')[0];
    assert.equal(s.paper, 'A0');
    assert.equal(s.viewports[0].scale, 1000);
    assert.equal(s.fits, false);
    assert.equal(s.reason.key, 'draftSet.reason.noFit');
    assert.ok(p.notes.some((n) => n.key === 'draftSet.note.noFit' && n.params.kind === 'plans'));
  });

  it('a large site that fits on A0 at a smaller scale takes that scale, not the smallest', () => {
    const p = planDraftSet(input({ bounds: box(180, 120, 20), storeys: storeys(1) }));
    const s = sheetsOf(p, 'plans')[0];
    assert.equal(s.paper, 'A0');
    assert.equal(s.fits, true);
    assert.equal(s.viewports[0].scale, 200);
  });

  it('a tiny model is not drawn larger than 1:20', () => {
    const p = planDraftSet(input({ bounds: box(1, 1, 1), storeys: storeys(1) }));
    assert.equal(sheetsOf(p, 'plans')[0].viewports[0].scale, 20);
  });

  it('sections run through the middle of the box, A-A along x looking north, B-B along z looking east', () => {
    const p = planDraftSet(input({ bounds: box(12, 10, 6, 100, 200) }));
    const [a, b] = p.views.filter((v) => v.kind === 'section');
    assert.equal(a.kind === 'section' && a.axis, 'x');
    if (a.kind !== 'section' || b.kind !== 'section') throw new Error('sections');
    assert.deepEqual(a.line, { a: { x: 99, y: 205 }, b: { x: 113, y: 205 }, side: { x: 106, y: 204 } });
    assert.deepEqual(b.line, { a: { x: 106, y: 199 }, b: { x: 106, y: 211 }, side: { x: 107, y: 205 } });
    // Marked on the plan nearest ±0.00.
    const plans = p.views.filter((v) => v.kind === 'plan');
    assert.equal(a.onPlan, plans[0].key);
  });

  it('marks sections on the storey closest to zero elevation', () => {
    const p = planDraftSet(input({ storeys: [{ name: 'Basement', elevation: -3 }, { name: 'Ground', elevation: 0.1 }, { name: 'Level 1', elevation: 3 }] }));
    const s = p.views.find((v) => v.kind === 'section');
    assert.equal(s?.kind === 'section' && s.onPlan, 'plan:0.1');
  });

  it('gives each section and elevation a depth with its reason', () => {
    const p = planDraftSet(input({ bounds: box(12, 10, 6) }));
    const depth = (name: string) => {
      const v = p.views.find((x) => x.name === name);
      return v && v.kind !== 'plan' ? v.depth : null;
    };
    // A-A looks north from the middle of 10 m: 5 m to the far wall + 1 m. B-B: 6 m + 1 m.
    assert.equal(depth('Section A-A'), 6);
    assert.equal(depth('Section B-B'), 7);
    // North / south see through the 10 m depth, east / west through 12 m, each + 1 m.
    assert.equal(depth('North Elevation'), 11);
    assert.equal(depth('East Elevation'), 13);
    const e = p.views.find((x) => x.kind === 'elevation');
    assert.equal(e?.kind === 'elevation' && e.depthReason.key, 'draftSet.depth.elevation');
    assert.equal(e?.kind === 'elevation' && e.depthReason.params.depth, 11);
  });

  it('keeps every sheet inside its paper across a range of model sizes', () => {
    for (const [w, d, h] of [[6, 5, 3], [12, 10, 9], [25, 12, 12], [60, 20, 15], [150, 40, 30], [400, 300, 50]] as const) {
      for (const n of [1, 3, 7]) {
        const p = planDraftSet(input({ bounds: box(w, d, h), storeys: storeys(n) }));
        for (const s of p.sheets) if (s.fits) assertInside(s);
        assert.deepEqual(p.sheets.map((s) => s.number), p.sheets.map((s, i, all) => `A-${(s.group === 'plans' ? 101 : s.group === 'elevations' ? 201 : 301) + all.slice(0, i).filter((o) => o.group === s.group).length}`));
      }
    }
  });
});
