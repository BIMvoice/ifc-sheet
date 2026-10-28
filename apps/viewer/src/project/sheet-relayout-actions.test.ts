/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #450: changing a viewport's scale on a generated sheet lays the sheet's other drawings out again (one undo step); a
 * sheet the person arranged is left alone and the layout is offered. A drawing that no longer fits says so.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clearDraftHistory, undoDrafts } from '@/drafting/draft-store';
import { drawingArea, viewExtent, type ModelExtent } from './drawing-set.js';
import { resetProject, useProjectStore } from './project-store.js';
import { defaultViews } from './view-defaults.js';
import { setGroupScale, startDrawingSet } from './drawing-set-actions.js';
import { changeViewportScale, relaySheetAt } from './sheet-relayout-actions.js';
import { updateViewport } from './sheets.js';
import { isRescaledNote, sheetIsAsLaid } from '@bimvoice/ifcsheet';
import type { ProjectLevel, ProjectSheet, SheetViewport } from './types.js';

/** A block of flats, five storeys: its plans share A-101 and A-102 two to a sheet. */
const FLATS: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 8, y: 15, z: 6 } };
/** Twice as wide: two plans fit side by side on A3 at 1:100 but not at 1:50. */
const WIDE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 16, y: 15, z: 6 } };
const LEVELS: ProjectLevel[] = [0, 1, 2, 3, 4].map((i) => ({ name: `L${i}`, elevation: i * 3, storeyGlobalIds: [`L${i}`] }));

const state = () => useProjectStore.getState();
const sheetOne = (): ProjectSheet => state().sheets.find((s) => s.number === 'A-101')!;
const viewsOf = (extent: ModelExtent) => (sheet: ProjectSheet) => (sheet.viewports ?? []).map((vp) => viewExtent(state().views.find((v) => v.id === vp.viewId)!, extent));

function begin(extent: ModelExtent): void {
  resetProject();
  clearDraftHistory();
  useProjectStore.setState({ levels: LEVELS, views: defaultViews(LEVELS) });
  startDrawingSet(null, extent);
  setGroupScale('plans', 100, extent);
}

/** Overlaps and escapes of a sheet's viewports: their boxes (the drawing's own size at the viewport's scale) against each other and the drawing area. */
function problems(sheet: ProjectSheet, extent: ModelExtent): string[] {
  const area = drawingArea(sheet);
  const boxes = (sheet.viewports ?? []).map((vp, i) => {
    const size = viewsOf(extent)(sheet)[i];
    return { vp, w: (size.w * 1000) / vp.scale, h: (size.h * 1000) / vp.scale };
  });
  const out: string[] = [];
  boxes.forEach((a, i) => {
    if (a.vp.x - a.w / 2 < area.x || a.vp.x + a.w / 2 > area.x + area.w || a.vp.y - a.h / 2 < area.y || a.vp.y + a.h / 2 > area.y + area.h) out.push(`${i} leaves the drawing area`);
    boxes.slice(i + 1).forEach((b, j) => {
      if (Math.abs(a.vp.x - b.vp.x) < (a.w + b.w) / 2 && Math.abs(a.vp.y - b.vp.y) < (a.h + b.h) / 2) out.push(`${i} overlaps ${i + 1 + j}`);
    });
  });
  return out;
}

const first = (sheet: ProjectSheet): SheetViewport => sheet.viewports![0];

describe('a scale change on a generated sheet (#450)', () => {
  beforeEach(() => begin(FLATS));

  it('starts as the layout left it, and a moved, cropped or rescaled viewport makes it the person\'s', () => {
    assert.equal(sheetIsAsLaid(sheetOne(), state().views, FLATS), true);
    const moved = { ...sheetOne(), viewports: sheetOne().viewports!.map((v, i) => (i === 0 ? { ...v, x: v.x + 5 } : v)) };
    const cropped = { ...sheetOne(), viewports: sheetOne().viewports!.map((v, i) => (i === 0 ? { ...v, width: 100, height: 80 } : v)) };
    const mixed = { ...sheetOne(), viewports: sheetOne().viewports!.map((v, i) => (i === 0 ? { ...v, scale: 50 } : v)) };
    assert.deepEqual([moved, cropped, mixed].map((s) => sheetIsAsLaid(s, state().views, FLATS)), [false, false, false]);
  });

  it('1:100 to 1:50 lays the sheet again without overlaps, in one undo step', () => {
    const before = sheetOne();
    assert.equal(before.viewports!.length, 2);
    assert.deepEqual(problems(before, FLATS), []);

    const result = changeViewportScale(before.id, first(before).id, first(before).viewId, 50, FLATS);

    const after = sheetOne();
    assert.equal(result, 'relaid');
    assert.deepEqual(after.viewports!.map((v) => v.scale), [50, 50]);
    // The row is wider than it was, and the two drawings are further apart: they neither overlap nor leave the paper.
    assert.ok(after.viewports![1].x - after.viewports![0].x > before.viewports![1].x - before.viewports![0].x);
    assert.deepEqual(problems(after, FLATS), []);
    assert.equal(after.notes, undefined);
    // The views draw at the new scale too (their annotations are sized for it).
    assert.deepEqual(after.viewports!.map((v) => state().views.find((w) => w.id === v.viewId)!.scale), [50, 50]);

    assert.equal(undoDrafts(), true);
    assert.deepEqual(sheetOne().viewports!.map((v) => [v.x, v.y, v.scale]), before.viewports!.map((v) => [v.x, v.y, v.scale]));
  });

  it('leaves a hand-arranged sheet alone, and the offered layout is one undo step', () => {
    const start = sheetOne();
    updateViewport(start.id, first(start).id, { x: first(start).x - 20 });
    const arranged = sheetOne();
    assert.equal(sheetIsAsLaid(arranged, state().views, FLATS), false);

    const result = changeViewportScale(arranged.id, first(arranged).id, first(arranged).viewId, 50, FLATS);

    const kept = sheetOne();
    assert.equal(result, 'kept');
    assert.deepEqual(kept.viewports!.map((v) => v.scale), [50, 100]);
    assert.deepEqual([kept.viewports![0].x, kept.viewports![1].x], [arranged.viewports![0].x, arranged.viewports![1].x]);
    assert.deepEqual([kept.viewports![0].y, kept.viewports![1].y], [arranged.viewports![0].y, arranged.viewports![1].y]);

    assert.equal(relaySheetAt(kept.id, 50, FLATS), true);
    const laid = sheetOne();
    assert.deepEqual(laid.viewports!.map((v) => v.scale), [50, 50]);
    assert.deepEqual(problems(laid, FLATS), []);
    assert.equal(sheetIsAsLaid(laid, state().views, FLATS), true);
    assert.equal(undoDrafts(), true);
    assert.deepEqual(sheetOne().viewports!.map((v) => [v.x, v.y, v.scale]), kept.viewports!.map((v) => [v.x, v.y, v.scale]));
  });
});

describe('a drawing that no longer fits at the new scale (#450)', () => {
  beforeEach(() => begin(WIDE));

  it('is laid at the scale that fits, and the sheet says so; the note goes when a scale fits again', () => {
    const sheet = sheetOne();
    assert.equal(changeViewportScale(sheet.id, first(sheet).id, first(sheet).viewId, 50, WIDE), 'relaid');
    const after = sheetOne();
    assert.deepEqual(after.viewports!.map((v) => v.scale), [100, 100]);
    assert.deepEqual(problems(after, WIDE), []);
    assert.deepEqual(after.notes, ['Scale 1:100: the drawing does not fit A3 at 1:50.']);

    changeViewportScale(after.id, first(after).id, first(after).viewId, 200, WIDE);
    const coarser = sheetOne();
    assert.deepEqual(coarser.viewports!.map((v) => v.scale), [200, 200]);
    assert.equal((coarser.notes ?? []).some(isRescaledNote), false);
  });
});

describe('what a scale change must not do (#450)', () => {
  beforeEach(() => begin(FLATS));

  it('offers no layout on a sheet the layout cannot place (a schedule hangs on it): the offer would do nothing', () => {
    const start = sheetOne();
    const schedule: SheetViewport = { ...first(start), id: 'vp-schedule', viewId: 'schedule-not-a-view', x: first(start).x + 60 };
    useProjectStore.setState({ sheets: state().sheets.map((s) => (s.id === start.id ? { ...s, viewports: [...(s.viewports ?? []), schedule] } : s)) });
    const result = changeViewportScale(start.id, first(start).id, first(start).viewId, 50, FLATS);
    assert.equal(result, 'alone');
    assert.equal(relaySheetAt(start.id, 50, FLATS), false);
  });

  it('keeps a note the person wrote, even one that starts like a rescaled note', () => {
    const start = sheetOne();
    const own = 'Scale 1:20: see the stair detail on A-501';
    useProjectStore.setState({ sheets: state().sheets.map((s) => (s.id === start.id ? { ...s, notes: [own] } : s)) });
    assert.equal(changeViewportScale(start.id, first(start).id, first(start).viewId, 50, FLATS), 'relaid');
    assert.deepEqual(sheetOne().notes, [own]);
    assert.equal(isRescaledNote(own), false);
  });
});
