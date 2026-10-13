/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addProjectSheet, addProjectView, removeProjectItem, resetProject, setSheetNumber, syncProjectWithModels, updateProjectView, useProjectStore } from '@/project/project-store';
import { parseProjectFile, serializeProject } from '@/project/project-file';
import { projectDocument } from '@/project/project-store';
import { addViewport } from '@/project/sheets';
import { detailRect, detailScale, nextDetailNumber } from '@/project/detail';
import { clearDraftHistory, undoDrafts } from './draft-store';
import { addDetail, setDetailRect } from './commands/detail';
import { eraseCommand } from './commands/modify';
import { detailGrips, markParts, moveDetailGrip, selectedDetailGrips } from './detail-mark';
import { isLockedToView } from './section-symbol';
import type { DraftContext } from './commands/types';

const A = { x: 2, y: 3 };
const B = { x: 6, y: 5 };
const cur = { textStyle: 'standard', dimStyle: 'standard' };
const state = () => useProjectStore.getState();
const planView = () => state().views.find((v) => v.kind === 'plan') as NonNullable<ReturnType<typeof state>['views'][number]>;
const details = () => state().views.filter((v) => v.detail);
const markOf = (id: string) => state().drafts.filter((d) => d.params.detailOf === id);

beforeEach(() => {
  resetProject();
  clearDraftHistory();
  syncProjectWithModels([{ key: 'm', name: 'm' }], [{ name: 'Ground Floor', elevation: 0 }]);
  updateProjectView(planView().id, { scale: 100, cutHeight: 1.4, viewDepth: 2.5 });
});

describe('the scale of a detail', () => {
  it('is the offered scale nearest a quarter of the source', () => {
    const offered = [1, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
    assert.equal(detailScale(100, offered), 25);
    assert.equal(detailScale(200, offered), 50);
    assert.equal(detailScale(50, offered), 10);
    assert.equal(detailScale(1, offered), 1);
  });
});

describe('a detail of an area', () => {
  it('is the source view at a larger scale, cropped to the area, with the same cut and depth', () => {
    const id = addDetail(planView().id, B, A, cur);
    const view = details()[0];
    assert.equal(view.id, id);
    assert.equal(view.kind, 'plan');
    assert.equal(view.name, `Detail 1 - ${planView().name}`);
    assert.equal(view.scale, 25);
    assert.deepEqual(view.detail, { of: planView().id, min: { x: 2, y: 3 }, max: { x: 6, y: 5 }, number: 1 });
    assert.equal(view.viewDepth, 2.5);
    assert.equal((view as typeof view & { cutHeight: number }).cutHeight, 1.4);
    assert.equal(view.auto, false);
  });

  it('numbers details by the next free number', () => {
    addDetail(planView().id, A, B, cur);
    addDetail(planView().id, { x: 7, y: 7 }, { x: 9, y: 9 }, cur);
    assert.deepEqual(details().map((v) => v.detail?.number), [1, 2]);
    assert.equal(nextDetailNumber(state().views), 3);
  });

  it('refuses an area too small to show', () => {
    assert.equal(addDetail(planView().id, A, { x: 2.01, y: 5 }, cur), null);
    assert.equal(detailRect(A, { x: 2.01, y: 5 }), null);
    assert.equal(details().length, 0);
  });

  it('does not copy the annotation of the source into the detail', () => {
    const before = state().drafts.length;
    const id = addDetail(planView().id, A, B, cur) as string;
    assert.equal(state().drafts.filter((d) => d.viewId === id).length, 0);
    assert.equal(state().drafts.length - before, markOf(id).length);
  });

  it('puts its mark on the source: dashed rounded rectangle and a label, locked to the detail', () => {
    const id = addDetail(planView().id, A, B, cur) as string;
    const parts = markOf(id);
    assert.equal(parts.length, 9);
    assert.deepEqual(parts.map((p) => p.shape.type), ['line', 'line', 'line', 'line', 'arc', 'arc', 'arc', 'arc', 'text']);
    assert.ok(parts.every((p) => p.viewId === planView().id && isLockedToView(p, state().views)));
    assert.equal(state().draftLayers.find((l) => l.id === parts[0].layerId)?.lineType, 'dashed');
    assert.equal(parts[8].shape.type === 'text' && parts[8].shape.text, '1');
    // On a plan the top of the screen is the small y: the label stands above the top edge.
    assert.ok(parts[8].shape.type === 'text' && parts[8].shape.p.y < 3);
  });

  it('shows the sheet number in the label once the detail is on a sheet, and follows a renumbering', () => {
    const id = addDetail(planView().id, A, B, cur) as string;
    const label = () => { const t = markOf(id).find((d) => d.shape.type === 'text'); return t?.shape.type === 'text' ? t.shape.text : null; };
    const sheet = addProjectSheet('Plan and detail');
    addViewport(sheet, planView().id, { x: 100, y: 100 }, 100);
    assert.equal(label(), '1');
    addViewport(sheet, id, { x: 250, y: 100 }, 25);
    assert.equal(label(), `1/${state().sheets.find((s) => s.id === sheet)?.number}`);
    setSheetNumber(sheet, 'D-7');
    assert.equal(label(), '1/D-7');
  });

  it('is removed with its mark when the view is deleted', () => {
    const id = addDetail(planView().id, A, B, cur) as string;
    removeProjectItem(id);
    assert.equal(details().length, 0);
    assert.equal(markOf(id).length, 0);
  });

  it('is removed when its mark is erased, as one undo step', () => {
    const id = addDetail(planView().id, A, B, cur) as string;
    const ctx = { entities: () => state().drafts, selection: () => new Set([markOf(id)[0].id]), setSelection: () => undefined, say: () => undefined, viewId: planView().id } as unknown as DraftContext;
    eraseCommand.create(ctx).onEnter?.();
    assert.equal(details().length, 0);
    assert.equal(markOf(id).length, 0);
    undoDrafts();
    assert.equal(details().length, 1);
    assert.equal(markOf(id).length, 9);
  });

  it('changes its area from the mark\'s grips: the crop and the mark move together, in one undo step', () => {
    const id = addDetail(planView().id, A, B, cur) as string;
    const sel = selectedDetailGrips(new Set([markOf(id)[3].id]), state().drafts, state().views);
    assert.ok(sel);
    assert.equal(sel.grips.length, 8);
    const moved = moveDetailGrip(sel.rect, 'x1y1', { x: 9, y: 8 });
    assert.deepEqual(moved, { min: { x: 2, y: 3 }, max: { x: 9, y: 8 } });
    setDetailRect(id, moved as NonNullable<typeof moved>);
    assert.deepEqual(details()[0].detail?.max, { x: 9, y: 8 });
    const line = markOf(id)[0].shape;
    assert.ok(line.type === 'line' && line.b.x > 8 && line.a.y === 3);
    undoDrafts();
    assert.deepEqual(details()[0].detail?.max, { x: 6, y: 5 });
    const back = markOf(id)[0].shape;
    assert.ok(back.type === 'line' && back.b.x < 6);
  });

  it('refuses a grip move that leaves no area', () => {
    const rect = { min: A, max: B };
    assert.equal(moveDetailGrip(rect, 'x1', { x: 2, y: 4 }), null);
    assert.equal(detailGrips(rect).length, 8);
    assert.deepEqual(moveDetailGrip(rect, 'y0', { x: 0, y: 1 }), { min: { x: 2, y: 1 }, max: B });
  });

  it('is saved with the project and opens again', () => {
    const id = addDetail(planView().id, A, B, cur) as string;
    const text = serializeProject(projectDocument());
    const doc = parseProjectFile(text);
    assert.deepEqual(doc.views.find((v) => v.id === id)?.detail, { of: planView().id, min: A, max: B, number: 1 });
    assert.equal(doc.drafts.filter((d) => d.params.detailOf === id).length, 9);
  });

  it('is not made on a 3D view', () => {
    const three = addProjectView({ kind: '3d', name: 'Axo', viewpoint: null });
    assert.equal(addDetail(three, A, B, cur), null);
  });
});

it('a mark has no shapes of its own after its detail is gone', () => {
  const id = addDetail(planView().id, A, B, cur) as string;
  removeProjectItem(id);
  assert.deepEqual(markParts(state().drafts, id), []);
});
