/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #168, the flagship flow: a view dropped on a sheet. On AC20-FZK-Haus, the outline shown while it is dragged is the
 * drawing at true size (the drawn plan lies inside it, filling it), it snaps like a moved viewport, and letting go
 * places the view there, framed as the set frames one it hangs, in one undo step.
 */

import '@/test/setup-dom.js';
import { before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateDefaultSet, type ModelExtent } from '@bimvoice/ifcsheet';
import { generateViewDrawings, openModel, type OpenedModel } from '@bimvoice/ifcsheet/headless';
import { FZK_HAUS, planModelMissing, serveWasmFromDisk } from '@/test/discipline-plan-fixture';
import { clearDraftHistory, undoDrafts } from '@/drafting/draft-store';
import { viewCentre } from './drawing-set';
import { resetProject, useProjectStore } from './project-store';
import { titleBlockRect, frameOf } from './sheet-frame';
import { paperOf } from './sheets';
import { dropPreview, dropSize, dropsAtTrueSize, placeDropped } from './viewport-drop';
import { snapTolerance } from './viewport-snap';
import type { ProjectLevel, ProjectSheet, ProjectView } from './types';

const sheet: ProjectSheet = { id: 's', number: 'A-109', name: 'Free', createdAt: 0, paper: 'A1', orientation: 'landscape', viewports: [] };

describe('dropping a view on a sheet (#168), on AC20-FZK-Haus', { skip: planModelMissing(FZK_HAUS) }, () => {
  let model: OpenedModel;
  let extent: ModelExtent;
  let views: ProjectView[];
  let levels: ProjectLevel[];
  let plan: ProjectView;

  before(async () => {
    serveWasmFromDisk();
    model = await openModel(new Uint8Array(readFileSync(FZK_HAUS)));
    assert.ok(model.extent, 'the engine measures the building');
    extent = model.extent;
    const set = generateDefaultSet(model);
    assert.ok(set, 'the engine lays out a set');
    views = set.document.views;
    levels = set.levels;
    const found = views.find((v) => v.kind === 'plan' && !v.site);
    assert.ok(found, 'the set has a plan');
    plan = found;
  });
  beforeEach(() => {
    resetProject();
    clearDraftHistory();
    useProjectStore.setState({ views, sheets: [sheet] });
  });

  it('outlines the plan at true size: the drawn plan, framed as it will be placed, lies inside the outline and fills it', async () => {
    const scale = 100;
    const size = dropSize(plan, extent, scale);
    const drawing = (await generateViewDrawings([plan], model.buildingMeshes, levels, extent)).get(plan.id);
    assert.ok(drawing, 'the plan draws');
    const c = viewCentre(plan, extent);
    assert.ok(c, 'a plan is framed on the model extent');
    const k = 1000 / scale;
    const half = { x: Math.max(Math.abs(drawing.bounds.min.x - c.x), Math.abs(drawing.bounds.max.x - c.x)) * k, y: Math.max(Math.abs(drawing.bounds.min.y - c.y), Math.abs(drawing.bounds.max.y - c.y)) * k };
    assert.ok(half.x <= size.width / 2 + 0.5 && half.y <= size.height / 2 + 0.5, `drawn ${2 * half.x} x ${2 * half.y} mm, outline ${size.width} x ${size.height} mm`);
    assert.ok(2 * half.x > size.width * 0.8 && 2 * half.y > size.height * 0.8, `the outline is no bigger than the drawing needs: drawn ${2 * half.x} x ${2 * half.y} mm, outline ${size.width} x ${size.height} mm`);
    const twice = dropSize(plan, extent, 50);
    assert.ok(Math.abs(twice.width - 2 * size.width) < 1e-9 && Math.abs(twice.height - 2 * size.height) < 1e-9, 'at 1:50 it is twice as big as at 1:100');
  });

  it('snaps the outline to the title block and to the drawings already on the sheet, as a move does', () => {
    const tol = snapTolerance(1);
    const size = dropSize(plan, extent, plan.scale ?? 100);
    const block = titleBlockRect(paperOf(sheet), frameOf(sheet));
    const right = dropPreview(sheet, plan, extent, [], { x: block.x - size.width / 2 - 3, y: 200 }, tol);
    assert.ok(right);
    assert.equal(right.x, block.x - size.width / 2, 'its right edge lands exactly on the title block\'s left');
    assert.ok(right.guides.some((g) => g.axis === 'x' && g.at === block.x), 'with the guide showing');
    const other = { x: 200, y: 200, width: 120, height: 80 };
    const beside = dropPreview(sheet, plan, extent, [other], { x: 260 + size.width / 2 + 2, y: 202 }, tol);
    assert.ok(beside);
    assert.deepEqual([beside.x, beside.y], [260 + size.width / 2, 200], 'edge to edge with the drawing beside it, and centre to centre across');
    assert.equal(dropPreview(sheet, plan, extent, [], { x: -5, y: 200 }, tol), null, 'off the paper there is nowhere to land');
  });

  it('places the view where it was let go, framed as the set frames one, in one undo step', () => {
    const preview = dropPreview(sheet, plan, extent, [], { x: 300, y: 250 }, snapTolerance(1));
    assert.ok(preview);
    const id = placeDropped('s', plan, preview, extent);
    const vp = useProjectStore.getState().sheets[0].viewports?.find((v) => v.id === id);
    assert.ok(vp, 'it is on the sheet');
    assert.deepEqual({ x: vp.x, y: vp.y, scale: vp.scale, viewId: vp.viewId }, { x: preview.x, y: preview.y, scale: preview.scale, viewId: plan.id });
    assert.deepEqual(vp.center, viewCentre(plan, extent), 'centred on the model extent, so the drawing fills its outline');
    undoDrafts();
    assert.deepEqual(useProjectStore.getState().sheets[0].viewports, [], 'one undo takes it off again');
  });

  it('offers the outline only for the views the model extent sizes', () => {
    assert.ok(views.filter((v) => v.kind === 'elevation' || v.kind === 'section').every(dropsAtTrueSize));
    assert.equal(dropsAtTrueSize({ id: 'd', kind: 'drafting', name: 'Detail', createdAt: 0 }), false, 'a drafting view frames its drafts');
  });
});
