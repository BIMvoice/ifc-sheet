/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #51: adding, removing, renaming and duplicating sheets, removing a view or a schedule, and editing a view are each
 * exactly one undo step, and a removed item comes back with everything it took with it.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clearDraftHistory, redoDrafts, undoDrafts } from '@/drafting/draft-store';
import { addProjectSheet, duplicateProjectSheet, removeProjectItem, renameProjectItem, resetProject, syncProjectWithModels, updateProjectView, useProjectStore } from './project-store.js';
import { setGroupScale, startDrawingSet } from './drawing-set-actions.js';
import { nudgeViewport } from './viewport-snap.js';
import { redoEarliest, undoLatest } from './unified-undo.js';
import { inSetOrder } from './drawing-register.js';
import type { ProjectSheet } from './types';

const bounds = { min: { x: 100, y: 0, z: 200 }, max: { x: 112, y: 6, z: 210 } };
const state = () => useProjectStore.getState();
const register = () => inSetOrder(state().sheets, state().schedules).map((s) => `${s.number}:${s.name}`);
const everything = () => JSON.stringify({ sheets: state().sheets, views: state().views, drafts: state().drafts, schedules: state().schedules, legends: state().legends, civil: state().civilDrawings, comments: state().comments, reg: register() });

beforeEach(() => {
  resetProject();
  clearDraftHistory();
  syncProjectWithModels([{ key: 'm', name: 'm' }], [{ name: 'Ground Floor', elevation: 0 }, { name: 'Level 1', elevation: 3 }]);
  startDrawingSet(null, bounds);
});

function oneStep(edit: () => void): void {
  clearDraftHistory();
  const before = everything();
  edit();
  const after = everything();
  assert.notEqual(after, before, 'the edit changed something');
  assert.equal(undoDrafts(), true);
  assert.equal(everything(), before, 'one undo returns to the state before');
  assert.equal(undoDrafts(), false, 'and it was the only step');
  assert.equal(redoDrafts(), true);
  assert.equal(everything(), after, 'redo reapplies it');
  assert.equal(redoDrafts(), false);
}

const sheetShowing = (viewId: string): ProjectSheet[] => state().sheets.filter((s) => (s.viewports ?? []).some((v) => v.viewId === viewId));

describe('sheets (#51)', () => {
  it('removing a sheet, then undo: the sheet, its viewports and its number come back exactly, and the register agrees', () => {
    const sheet = state().sheets.find((s) => (s.viewports ?? []).length > 0 && /^A-2/.test(s.number)) ?? state().sheets.filter((s) => (s.viewports ?? []).length > 0).at(-1);
    assert.ok(sheet);
    const number = sheet.number;
    const sheetJson = JSON.stringify(sheet);
    const reg = register();
    state().sheets.indexOf(sheet);
    useProjectStore.setState({ comments: [{ id: 'c1', sheetId: sheet.id, x: 1, y: 1 } as never] });
    clearDraftHistory();
    const full = everything();
    removeProjectItem(sheet.id);
    assert.equal(state().sheets.some((s) => s.id === sheet.id), false);
    assert.equal(state().comments?.length, 0);
    undoDrafts();
    assert.equal(JSON.stringify(state().sheets.find((s) => s.id === sheet.id)), sheetJson);
    assert.equal(state().sheets.find((s) => s.id === sheet.id)?.number, number);
    assert.deepEqual(register(), reg);
    assert.equal(state().comments?.length, 1, 'the comment pinned on it is back');
    assert.equal(everything(), full);
  });

  it('removing a sheet is one step', () => oneStep(() => removeProjectItem(state().sheets[1].id)));
  it('adding a sheet is one step', () => oneStep(() => { addProjectSheet('New'); }));
  it('renaming a sheet is one step', () => oneStep(() => renameProjectItem(state().sheets[0].id, 'Renamed sheet')));
  it('duplicating a sheet is one step', () => oneStep(() => { duplicateProjectSheet(state().sheets[0].id); }));
  it('add then rename then duplicate: three undos, three redos, in order', () => {
    clearDraftHistory();
    const s0 = everything();
    const id = addProjectSheet('Mine');
    const s1 = everything();
    renameProjectItem(id, 'Mine 2');
    const s2 = everything();
    duplicateProjectSheet(id);
    undoDrafts(); assert.equal(everything(), s2);
    undoDrafts(); assert.equal(everything(), s1);
    undoDrafts(); assert.equal(everything(), s0);
    assert.equal(undoDrafts(), false);
    redoDrafts(); assert.equal(everything(), s1);
    redoDrafts(); assert.equal(everything(), s2);
    redoDrafts();
    assert.equal(state().sheets.filter((s) => s.name === 'Mine 2 Copy').length, 1);
  });
});

describe('views (#51)', () => {
  it('removing a view shown on two sheets: undo restores the view, its drawing and both viewports', () => {
    const shared = state().views.find((v) => sheetShowing(v.id).length >= 1);
    assert.ok(shared);
    // Show it on a second sheet too.
    const second = state().sheets.find((s) => !sheetShowing(shared.id).includes(s));
    assert.ok(second);
    useProjectStore.setState((s) => ({ sheets: s.sheets.map((x) => (x.id === second.id ? { ...x, viewports: [...(x.viewports ?? []), { id: 'vp-extra', viewId: shared.id, x: 10, y: 10, scale: 100, width: 0, height: 0, center: null }] } : x)) }));
    useProjectStore.setState((s) => ({ drafts: [...s.drafts, { id: 'd1', viewId: shared.id, layerId: '0', shape: { kind: 'line', a: { x: 0, y: 0 }, b: { x: 1, y: 1 } } as never, params: {} }] }));
    assert.ok(sheetShowing(shared.id).length >= 2);
    clearDraftHistory();
    const before = everything();
    removeProjectItem(shared.id);
    assert.equal(state().views.some((v) => v.id === shared.id), false);
    assert.equal(state().drafts.some((d) => d.viewId === shared.id), false);
    undoDrafts();
    assert.equal(everything(), before);
    assert.ok(sheetShowing(shared.id).length >= 2, 'both viewports are back');
    redoDrafts();
    assert.equal(state().views.some((v) => v.id === shared.id), false);
  });

  it('removing a view is one step', () => oneStep(() => removeProjectItem(state().views[0].id)));
  it('a view edit is one step', () => oneStep(() => updateProjectView(state().views[0].id, { name: undefined, scale: 77 } as never)));

  it('removing a split schedule: undo restores its parts, text rows and kept-apart list', () => {
    useProjectStore.setState({
      schedules: [
        { id: 'sc-parent', name: 'Doors', kind: 'door', createdAt: 1, textRows: [{ id: 'tr1', cells: { a: 'Maker' } }], keptApart: ['k|1', 'k|2'] } as never,
        { id: 'sc-part', name: 'Doors A', kind: 'door', createdAt: 2, sub: { parent: 'sc-parent' } } as never,
      ],
      legends: [{ id: 'lg1', name: 'Legend', createdAt: 1 } as never],
    });
    clearDraftHistory();
    const before = everything();
    removeProjectItem('sc-parent');
    assert.equal(state().schedules?.some((s) => s.id === 'sc-parent'), false);
    removeProjectItem('sc-part');
    removeProjectItem('lg1');
    undoDrafts(); undoDrafts(); undoDrafts();
    assert.equal(everything(), before);
    const parent = state().schedules?.find((s) => s.id === 'sc-parent');
    assert.deepEqual(parent?.keptApart, ['k|1', 'k|2']);
    assert.equal(parent?.textRows?.length, 1);
    assert.ok(state().schedules?.some((s) => s.id === 'sc-part'));
  });

  it('removing a schedule is one step', () => {
    useProjectStore.setState({ schedules: [{ id: 'sc', name: 'Doors', kind: 'door', createdAt: 1 } as never] });
    oneStep(() => removeProjectItem('sc'));
  });
  it('undo of a removal leaves what was added after it', () => {
    useProjectStore.setState({ schedules: [{ id: 'sc', name: 'Doors', kind: 'door', createdAt: 1 } as never] });
    clearDraftHistory();
    removeProjectItem('sc');
    useProjectStore.setState({ schedules: [{ id: 'later', name: 'Later', kind: 'door', createdAt: 2 } as never] });
    undoDrafts();
    assert.deepEqual(state().schedules?.map((s) => s.id).sort(), ['later', 'sc']);
  });
});

describe('the issue\'s done-when (#51)', () => {
  it('remove A-202, change the plans\' scale, move a viewport: three Undos bring each back in reverse order, three Redos redo them', () => {
    const a202 = state().sheets.find((s) => s.number === 'A-202');
    assert.ok(a202, 'the demo set has A-202');
    const s0 = everything();
    removeProjectItem(a202.id);
    const s1 = everything();
    setGroupScale('plans' as never, 200, { min: { x: 100, z: 200 }, max: { x: 112, z: 210 } } as never);
    const s2 = everything();
    const plan = state().sheets.find((s) => (s.viewports ?? []).length >= 2);
    assert.ok(plan);
    nudgeViewport(plan.id, (plan.viewports ?? [])[0], 7, 3);
    const s3 = everything();
    assert.deepEqual([s0, s1, s2].includes(s3), false);
    undoLatest(); assert.equal(everything(), s2);
    undoLatest(); assert.equal(everything(), s1);
    undoLatest(); assert.equal(everything(), s0);
    assert.equal(state().sheets.find((s) => s.id === a202.id)?.number, 'A-202');
    redoEarliest(); assert.equal(everything(), s1);
    redoEarliest(); assert.equal(everything(), s2);
    redoEarliest(); assert.equal(everything(), s3);
  });
});
