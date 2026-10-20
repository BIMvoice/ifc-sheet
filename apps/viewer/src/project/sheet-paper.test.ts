/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { drawingArea, estimatedBox, fitsScale, scaleOn, viewExtent, type ModelExtent } from './drawing-set.js';
import { hangView, seriesTemplates, setSheetFormat, startDrawingSet } from './drawing-set-actions.js';
import { addProjectSheet, resetProject, useProjectStore } from './project-store.js';
import { BUILT_IN_TEMPLATES, findTemplate } from './sheet-templates.js';
import { setSeriesTemplate, updateViewport } from './sheets.js';
import { addProjectView } from './project-store.js';
import { defaultViews } from './view-defaults.js';
import type { ProjectLevel, ProjectSheet, ProjectView } from './types.js';

/**
 * The demo project (the five-storey block of flats on the Wall): switching a
 * sheet to another paper lays its plans out again at the scale that fits,
 * and a sheet started from a template takes the template's paper and frame.
 */

/** The demo model's extent in the viewer frame, metres (measured on `bloc-p4.ifc` as the Wall measures it). */
const DEMO: ModelExtent = { min: { x: -0.085, y: -0.45, z: -13.735 }, max: { x: 22.735, y: 15.05, z: 1.525 } };
const LEVELS: ProjectLevel[] = ['Parter', 'Etaj 1', 'Etaj 2', 'Etaj 3', 'Etaj 4'].map((name, i) => ({ name, elevation: i * 3, storeyGlobalIds: [`L${i}`] }));

const state = () => useProjectStore.getState();
const sheetNo = (number: string): ProjectSheet => {
  const found = state().sheets.find((s) => s.number === number);
  assert.ok(found, number);
  return found;
};
const plansOn = (sheet: ProjectSheet): ProjectView[] => (sheet.viewports ?? []).map((vp) => state().views.find((v) => v.id === vp.viewId)!);

/** Every viewport's drawing, at its scale, lies inside the sheet's drawing area. */
function assertInsideArea(sheet: ProjectSheet): void {
  const area = drawingArea(sheet);
  for (const vp of sheet.viewports ?? []) {
    const view = state().views.find((v) => v.id === vp.viewId)!;
    const size = viewExtent(view, DEMO);
    const k = 1000 / vp.scale;
    const where = `${sheet.number} ${view.name} at 1:${vp.scale}`;
    assert.ok(vp.x - (size.w * k) / 2 >= area.x - 1e-6 && vp.x + (size.w * k) / 2 <= area.x + area.w + 1e-6, `${where}: across`);
    assert.ok(vp.y - (size.h * k) / 2 >= area.y - 1e-6 && vp.y + (size.h * k) / 2 <= area.y + area.h + 1e-6, `${where}: down`);
  }
}

beforeEach(() => {
  resetProject();
  useProjectStore.setState({ levels: LEVELS, views: defaultViews(LEVELS) });
  startDrawingSet(null, DEMO);
});

describe('switching a sheet\'s paper on the Wall', () => {
  it('A-101 to A1 portrait: its paper changes and its plans are laid out again at the scale that fits', () => {
    const before = sheetNo('A-101');
    assert.deepEqual([before.paper, before.orientation, before.viewports?.map((v) => v.scale)], ['A2', 'landscape', [100, 100]]);

    setSheetFormat(before.id, { paper: 'A1', orientation: 'portrait', templateId: null }, DEMO);

    const after = sheetNo('A-101');
    assert.deepEqual([after.paper, after.orientation], ['A1', 'portrait']);
    const sizes = plansOn(after).map((v) => viewExtent(v, DEMO));
    const fitting = scaleOn(sizes, { paper: 'A1', orientation: 'portrait' });
    assert.equal(fitting, 50, 'the plans (22.8 × 15.3 m) are drawn at 1:50 on the 574 × 771 mm area');
    assert.deepEqual(after.viewports?.map((v) => v.scale), [fitting, fitting]);
    assert.ok(fitsScale(sizes, drawingArea(after), fitting));
    assertInsideArea(after);
    // One above the other on a portrait sheet, not side by side.
    const [top, bottom] = after.viewports!;
    assert.equal(top.x, bottom.x);
    assert.ok(top.y < bottom.y);
    // The viewports are the same ones, and the drawings follow their scale.
    assert.deepEqual(after.viewports?.map((v) => v.id), before.viewports?.map((v) => v.id));
    assert.deepEqual(plansOn(after).map((v) => v.scale), [50, 50]);
  });

  it('a paper the plans no longer fit at their old scale puts them at the scale that does', () => {
    const id = sheetNo('A-101').id;
    setSheetFormat(id, { paper: 'A3', orientation: 'portrait', templateId: null }, DEMO);
    const after = sheetNo('A-101');
    // At 1:100 the plans are 228 mm across and the A3 portrait area is 277: they fit across but not one above the other.
    assertInsideArea(after);
    assert.deepEqual(after.viewports?.map((v) => v.scale), [200, 200]);
  });

  it('back to A2 landscape the plans go side by side at 1:100 again', () => {
    const id = sheetNo('A-101').id;
    setSheetFormat(id, { paper: 'A1', orientation: 'portrait', templateId: null }, DEMO);
    setSheetFormat(id, { paper: 'A2', orientation: 'landscape', templateId: null }, DEMO);
    const back = sheetNo('A-101');
    assert.deepEqual(back.viewports?.map((v) => v.scale), [100, 100]);
    assert.equal(back.viewports?.[0].y, back.viewports?.[1].y);
    assertInsideArea(back);
  });

  it('an elongated and a custom sheet are laid out on their own area', () => {
    const id = sheetNo('A-201').id;
    setSheetFormat(id, { paper: { kind: 'elongated', base: 'A2', factor: 3 }, templateId: null }, DEMO);
    assertInsideArea(sheetNo('A-201'));
    assert.deepEqual(drawingArea(sheetNo('A-201')), { x: 10, y: 10, w: 1241, h: 524 });
    setSheetFormat(id, { paper: { kind: 'custom', widthMm: 500, heightMm: 700 }, orientation: 'portrait', templateId: null }, DEMO);
    assert.deepEqual(drawingArea(sheetNo('A-201')), { x: 10, y: 10, w: 480, h: 630 });
    assertInsideArea(sheetNo('A-201'));
  });

  it('a frame change (a strip title block) takes the width it needs from the drawing area', () => {
    const id = sheetNo('A-101').id;
    const frame = { margins: { top: 10, right: 10, bottom: 10, left: 20 }, titleBlock: 'right' as const };
    setSheetFormat(id, { frame, templateId: null }, DEMO);
    assert.deepEqual(drawingArea(sheetNo('A-101')), { x: 20, y: 10, w: 594 - 20 - 10 - 50, h: 420 - 20 });
    assertInsideArea(sheetNo('A-101'));
  });

  it('without the model\'s extent the paper changes and the drawings stay', () => {
    const before = sheetNo('A-101');
    setSheetFormat(before.id, { paper: 'A0' }, null);
    assert.deepEqual(sheetNo('A-101').viewports, before.viewports);
    assert.equal(sheetNo('A-101').paper, 'A0');
  });
});

describe('a frame change keeps what was set by hand (review of #129)', () => {
  /** A-101 with its first plan hand-set to 1:20 in a 150 × 100 mm crop at (200, 150). */
  function handSet(): { sheet: ProjectSheet; viewScale: number | undefined } {
    const sheet = sheetNo('A-101');
    const vp = sheet.viewports![0];
    updateViewport(sheet.id, vp.id, { scale: 20, width: 150, height: 100, x: 200, y: 150 });
    const view = state().views.find((v) => v.id === vp.viewId)!;
    return { sheet: sheetNo('A-101'), viewScale: view.scale };
  }
  const viewScaleOf = (sheet: ProjectSheet): number | undefined => state().views.find((v) => v.id === sheet.viewports![0].viewId)!.scale;

  it('a 1 mm margin change leaves a hand-set 1:20 viewport, its box and its position as they were', () => {
    const { sheet, viewScale } = handSet();
    const frame = { margins: { top: 11, right: 10, bottom: 10, left: 10 }, titleBlock: 'bottom-right' as const };
    setSheetFormat(sheet.id, { frame, templateId: null }, DEMO);
    const after = sheetNo('A-101');
    assert.deepEqual(after.frame, frame);
    assert.deepEqual(after.viewports, sheet.viewports, 'every viewport keeps position, box and scale');
    assert.equal(viewScaleOf(after), viewScale, 'no scale is written back onto the view');
  });

  it('moving the title block to a strip keeps the hand-set viewport and only brings it inside the drawing area', () => {
    const { sheet, viewScale } = handSet();
    // Placed against the right edge, where the strip will be.
    updateViewport(sheet.id, sheet.viewports![0].id, { x: 500 });
    setSheetFormat(sheet.id, { frame: { margins: { top: 10, right: 10, bottom: 10, left: 10 }, titleBlock: 'right' }, templateId: null }, DEMO);
    const vp = sheetNo('A-101').viewports![0];
    const area = drawingArea(sheetNo('A-101'));
    assert.deepEqual([vp.scale, vp.width, vp.height, vp.y], [20, 150, 100, 150]);
    assert.equal(vp.x, area.x + area.w - 75, 'moved left just enough for its whole box to clear the strip');
    assert.equal(viewScaleOf(sheetNo('A-101')), viewScale);
  });

  it('a margin that leaves a viewport too big for the drawing area lays the sheet out again', () => {
    const sheet = sheetNo('A-101');
    updateViewport(sheet.id, sheet.viewports![0].id, { width: 560, height: 100 });
    setSheetFormat(sheet.id, { frame: { margins: { top: 10, right: 10, bottom: 10, left: 50 }, titleBlock: 'bottom-right' }, templateId: null }, DEMO);
    const after = sheetNo('A-101');
    assert.deepEqual(after.viewports!.map((v) => [v.width, v.height]), [[0, 0], [0, 0]], 'laid out again, fitted to the drawings');
    assertInsideArea(after);
  });
});

describe('a smaller paper keeps every viewport\'s whole box on the sheet (review of #129)', () => {
  const inside = (box: { width: number; height: number }, vp: { x: number; y: number }, area: { x: number; y: number; w: number; h: number }, what: string): void => {
    assert.ok(vp.x - box.width / 2 >= area.x - 1e-6 && vp.x + box.width / 2 <= area.x + area.w + 1e-6, `${what}: across`);
    assert.ok(vp.y - box.height / 2 >= area.y - 1e-6 && vp.y + box.height / 2 <= area.y + area.h + 1e-6, `${what}: down`);
  };

  it('A1 to A3 with no model loaded brings every viewport box inside the paper\'s drawing area', () => {
    const sheet = sheetNo('A-101');
    const [a, b] = sheet.viewports!;
    useProjectStore.setState({ sheets: state().sheets.map((s) => (s.id === sheet.id ? { ...s, paper: 'A1' } : s)) });
    updateViewport(sheet.id, a.id, { x: 700, y: 450, width: 150, height: 100, scale: 20 });
    updateViewport(sheet.id, b.id, { x: 780, y: 60 });
    setSheetFormat(sheet.id, { paper: 'A3', templateId: null }, null);
    const after = sheetNo('A-101');
    assert.equal(after.paper, 'A3');
    const area = drawingArea(after);
    for (const vp of after.viewports!) inside(estimatedBox(vp, state().views, null), vp, area, vp.id);
    assert.deepEqual([after.viewports![0].scale, after.viewports![0].width, after.viewports![0].height], [20, 150, 100], 'nothing to lay out again without the model: the box and scale stay');
  });

  it('a schedule\'s whole box, not only its centre, stays inside when the paper shrinks', () => {
    const sheet = sheetNo('A-101');
    const schedule = { id: 'vp-schedule', viewId: 'schedule-doors', x: 520, y: 300, scale: 50, width: 0, height: 0, center: null };
    useProjectStore.setState({ sheets: state().sheets.map((s) => (s.id === sheet.id ? { ...s, viewports: [...s.viewports!, schedule] } : s)) });
    // What the sheet draws for it: the schedule's own table size.
    const boxOf = (vp: { id: string; viewId: string; width: number; height: number; scale: number; x: number; y: number }) => (vp.id === schedule.id ? { width: 200, height: 120 } : estimatedBox({ ...vp, center: null }, state().views, DEMO));
    for (const extent of [DEMO, null]) {
      setSheetFormat(sheet.id, { paper: 'A2', templateId: null }, DEMO);
      useProjectStore.setState({ sheets: state().sheets.map((s) => (s.id === sheet.id ? { ...s, viewports: s.viewports!.map((v) => (v.id === schedule.id ? schedule : v)) } : s)) });
      setSheetFormat(sheet.id, { paper: 'A3', templateId: null }, extent, boxOf);
      const after = sheetNo('A-101');
      const vp = after.viewports!.find((v) => v.id === schedule.id)!;
      inside({ width: 200, height: 120 }, vp, drawingArea(after), `schedule, ${extent ? 'with' : 'without'} the model`);
    }
  });
});

describe('a custom size and frame that cannot hold the title block are refused (review of #129)', () => {
  const tight = { margins: { top: 50, right: 50, bottom: 50, left: 50 }, titleBlock: 'bottom-right' as const };

  it('200 × 200 mm with 50 mm margins (a 100 mm frame for a 180 mm title block) is refused and the sheet stays as it was', () => {
    const id = sheetNo('A-101').id;
    setSheetFormat(id, { paper: { kind: 'custom', widthMm: 200, heightMm: 200 }, templateId: null }, DEMO);
    const before = sheetNo('A-101');
    assert.deepEqual(drawingArea(before), { x: 10, y: 10, w: 180, h: 130 }, '200 × 200 with the standard frame holds the title block');
    const refused = setSheetFormat(id, { frame: tight, templateId: null }, DEMO);
    assert.deepEqual(refused, { frame: { w: 100, h: 100 }, titleBlock: { w: 180, h: 50 } });
    assert.deepEqual(sheetNo('A-101'), before);
  });

  it('the same in one change (paper and margins together, as a template carries them) is refused too', () => {
    const before = sheetNo('A-101');
    assert.ok(setSheetFormat(before.id, { paper: { kind: 'custom', widthMm: 200, heightMm: 200 }, frame: tight, templateId: null }, DEMO));
    assert.deepEqual(sheetNo('A-101'), before);
  });

  it('a strip title block needs 180 mm of frame height and some width beside it', () => {
    const strip = { margins: { top: 10, right: 10, bottom: 10, left: 10 }, titleBlock: 'right' as const };
    const id = sheetNo('A-101').id;
    assert.equal(setSheetFormat(id, { paper: { kind: 'custom', widthMm: 300, heightMm: 200 }, frame: strip, templateId: null }, DEMO), null, '180 mm frame height holds the 180 mm strip');
    assert.ok(drawingArea(sheetNo('A-101')).w > 0);
    assert.ok(setSheetFormat(id, { frame: { ...strip, margins: { ...strip.margins, top: 11 } }, templateId: null }, DEMO), '179 mm does not');
  });
});

describe('sheet templates', () => {
  it('has the built-in templates, "A3 details" among them', () => {
    const names = BUILT_IN_TEMPLATES.map((t) => t.name);
    assert.ok(['A1 plans', 'A3 details', 'A2 elevations long'].every((n) => names.includes(n)), names.join());
    const long = BUILT_IN_TEMPLATES.find((t) => t.name === 'A2 elevations long');
    assert.deepEqual(long?.paper, { kind: 'elongated', base: 'A2', factor: 3 });
  });

  it('every built-in template has the ISO 5457 filing margin of 20 mm on the left (review of #129)', () => {
    for (const t of BUILT_IN_TEMPLATES) assert.equal(t.frame.margins.left, 20, t.name);
  });

  it('a new detail sheet from the "A3 details" template has A3 paper and the template\'s margins and title block', () => {
    const details = findTemplate('builtin:a3-details')!;
    setSeriesTemplate('details', details.id);
    assert.equal(seriesTemplates().details?.name, 'A3 details');
    const plan = state().views.find((v) => v.kind === 'plan')!;
    const detailId = addProjectView({ kind: 'plan', name: 'Stair detail', cutHeight: 1.2, level: plan.kind === 'plan' ? plan.level : LEVELS[0], detail: { of: plan.id, number: 1, min: { x: 0, y: 0 }, max: { x: 4, y: 3 } }, scale: 25 });
    const landed = hangView(detailId, DEMO);
    const sheet = state().sheets.find((s) => s.id === landed)!;
    assert.deepEqual([sheet.number, sheet.paper, sheet.orientation, sheet.templateId], ['A-501', 'A3', 'landscape', 'builtin:a3-details']);
    assert.deepEqual(sheet.frame, details.frame);
    assert.deepEqual(sheet.frame?.margins, { top: 10, right: 10, bottom: 10, left: 20 });
    assert.equal(sheet.frame?.titleBlock, 'bottom-right');
    assert.equal(sheet.viewports?.[0].scale, 25, 'the scale the detail was made for fits A3, so it stays');
    assertInsideArea(sheet);
  });

  it('a sheet added with a template starts from it', () => {
    const id = addProjectSheet('Schedules', 'builtin:a3-schedules');
    const sheet = state().sheets.find((s) => s.id === id)!;
    assert.deepEqual([sheet.paper, sheet.frame?.titleBlock, sheet.templateId], ['A3', 'right', 'builtin:a3-schedules']);
    assert.equal(state().sheets.find((s) => s.id === addProjectSheet('Plain'))?.paper, undefined);
  });

  it('a series with a template makes its starting sheets on it', () => {
    resetProject();
    useProjectStore.setState({ levels: LEVELS, views: defaultViews(LEVELS), seriesTemplates: { plans: 'builtin:a1-plans', elevations: 'builtin:a2-elevations-long' } });
    startDrawingSet(null, DEMO);
    const plans = state().sheets.filter((s) => s.number.startsWith('A-1'));
    assert.deepEqual(new Set(plans.map((s) => s.paper)), new Set(['A1']));
    assert.ok(plans.every((s) => s.templateId === 'builtin:a1-plans'));
    const elevations = state().sheets.filter((s) => s.number.startsWith('A-2'));
    assert.ok(elevations.every((s) => typeof s.paper === 'object' && s.paper.kind === 'elongated'));
    // On the long sheet, two elevations side by side get a finer scale than on a plain A2.
    for (const s of state().sheets) assertInsideArea(s);
  });

  it('a series template that no longer exists is ignored', () => {
    setSeriesTemplate('plans', 'gone');
    assert.deepEqual(seriesTemplates(), {});
  });
});
