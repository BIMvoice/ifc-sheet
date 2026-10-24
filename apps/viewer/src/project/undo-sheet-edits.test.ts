/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #293, #51: the set built when a model opens is the bottom of the history, not a step, and each user-visible sheet edit is
 * exactly one undo step (undo once returns to the state before, redo reapplies).
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clearDraftHistory, redoDrafts, undoDrafts } from '@/drafting/draft-store';
import { redoEarliest, undoLatest } from './unified-undo.js';
import { resetProject, syncProjectWithModels, useProjectStore } from './project-store.js';
import { startDrawingSet, ensureDrawingSet, setGroupScale, swapViewportView } from './drawing-set-actions.js';
import { addViewport, editViewport, removeViewport, resetTitleBlockField, setProjectTitleBlockField, setTitleBlockField, setViewportScale, updateSheet } from './sheets.js';
import { nudgeViewport } from './viewport-snap.js';
import { setScheduleScale } from './schedule-scale-actions.js';
import type { ProjectSheet, SheetViewport } from './types';

const bounds = { min: { x: 100, y: 0, z: 200 }, max: { x: 112, y: 6, z: 210 } };
const state = () => useProjectStore.getState();
const snapshot = () => JSON.stringify({ sheets: state().sheets, views: state().views, titleBlock: state().titleBlock, titleBlockSources: state().titleBlockSources, schedules: state().schedules });
const planSheet = (): ProjectSheet => {
  const s = state().sheets.find((x) => (x.viewports ?? []).length >= 2);
  if (!s) throw new Error('a sheet with drawings');
  return s;
};
const firstVp = (): SheetViewport => (planSheet().viewports ?? [])[0];

beforeEach(() => {
  resetProject();
  clearDraftHistory();
  syncProjectWithModels([{ key: 'm', name: 'm' }], [{ name: 'Ground Floor', elevation: 0 }, { name: 'Level 1', elevation: 3 }]);
  startDrawingSet(null, bounds);
});

/** Do `edit`, and check it is exactly one step: Undo once is the state before, Redo once the state after, and nothing is left below. */
function oneStep(edit: () => void): void {
  clearDraftHistory();
  const before = snapshot();
  edit();
  const after = snapshot();
  assert.notEqual(after, before, 'the edit changed something');
  assert.equal(undoDrafts(), true);
  assert.equal(snapshot(), before, 'one undo returns to the state before the edit');
  assert.equal(undoDrafts(), false, 'and it was the only step');
  assert.equal(redoDrafts(), true);
  assert.equal(snapshot(), after, 'redo reapplies it');
  assert.equal(redoDrafts(), false);
}

describe('the set built when the model opens (#293)', () => {
  it('is the base of the history: Undo at the bottom keeps it and nothing is pushed', () => {
    const sheets = JSON.stringify(state().sheets);
    assert.ok(state().sheets.length > 0);
    undoLatest();
    assert.equal(JSON.stringify(state().sheets), sheets, 'the sheets are still there');
    assert.equal(undoDrafts(), false, 'there is no step below the start');
    assert.equal(redoDrafts(), false, 'and nothing to redo: the history is as it was');
  });

  it('keeps a redo that exists: Undo at the bottom does not clear it', () => {
    updateSheet(planSheet().id, { name: 'Renamed' });
    undoLatest();
    undoLatest();
    assert.notEqual(planSheet().name, 'Renamed');
    redoEarliest();
    assert.equal(state().sheets.some((s) => s.name === 'Renamed'), true, 'the edit came back, so the redo stack was intact');
  });

  it('is still undoable when a person asks for the set again (DRAFTSET): that is their step', () => {
    updateSheet(planSheet().id, { name: 'Renamed' });
    undoDrafts();
    const before = snapshot();
    useProjectStore.setState({ sheets: [] });
    ensureDrawingSet(null, bounds);
    assert.equal(undoDrafts(), true);
    assert.notEqual(snapshot(), before);
  });
});

describe('each sheet edit is one undo step (#51)', () => {
  it('deleting a drawing: undo restores it exactly, in the same place in the list', () => {
    const sheet = planSheet();
    const before = JSON.stringify(sheet);
    const victim = (sheet.viewports ?? [])[0];
    removeViewport(sheet.id, victim.id);
    assert.equal((state().sheets.find((s) => s.id === sheet.id)?.viewports ?? []).some((v) => v.id === victim.id), false);
    assert.equal(undoDrafts(), true);
    assert.equal(JSON.stringify(state().sheets.find((s) => s.id === sheet.id)), before);
    assert.equal(undoDrafts(), false);
  });

  it('deleting a drawing is one step', () => oneStep(() => removeViewport(planSheet().id, firstVp().id)));

  it('changing a drawing\'s scale restores the scale, the box and the view\'s scale', () => {
    const sheet = planSheet();
    const vp = firstVp();
    const was = vp.scale;
    const view = state().views.find((v) => v.id === vp.viewId);
    oneStep(() => setViewportScale(sheet.id, vp.id, vp.viewId, was === 50 ? 200 : 50));
    undoDrafts();
    assert.equal(firstVp().scale, was);
    assert.equal(JSON.stringify(firstVp()), JSON.stringify(vp), 'box and all');
    assert.equal(JSON.stringify(state().views.find((v) => v.id === vp.viewId)), JSON.stringify(view));
  });

  it('adding a drawing is one step', () => oneStep(() => addViewport(planSheet().id, state().views[0].id, { x: 50, y: 50 })));
  it('moving a drawing is one step', () => oneStep(() => nudgeViewport(planSheet().id, firstVp(), 7, 3)));
  it('resizing a drawing\'s crop, and fitting it again, are each one step', () => {
    oneStep(() => editViewport(planSheet().id, firstVp().id, { width: 90, height: 60 }));
    editViewport(planSheet().id, firstVp().id, { width: 90, height: 60 });
    oneStep(() => editViewport(planSheet().id, firstVp().id, { width: 0, height: 0 }));
  });
  it('paper size and orientation are each one step', () => {
    oneStep(() => updateSheet(planSheet().id, { paper: 'A0' }));
    oneStep(() => updateSheet(planSheet().id, { orientation: planSheet().orientation === 'portrait' ? 'landscape' : 'portrait' }));
  });
  it('a sheet title block field is one step', () => oneStep(() => setTitleBlockField(planSheet().id, 'drawnBy', 'PC')));
  it('the project title block field is one step, and so is putting it back to the model', () => {
    oneStep(() => setProjectTitleBlockField('project', 'Villa X'));
    setProjectTitleBlockField('project', 'Villa X');
    oneStep(() => resetTitleBlockField('project'));
  });
  it('a schedule\'s scale is one step', () => {
    const id = 'sched-1';
    useProjectStore.setState({ schedules: [{ id, name: 'Doors', kind: 'door', scale: 50 } as never] });
    useProjectStore.setState((s) => ({ sheets: s.sheets.map((x, i) => (i === 0 ? { ...x, viewports: [...(x.viewports ?? []), { id: 'vp-s', viewId: id, x: 10, y: 10, scale: 50, width: 0, height: 0, center: null }] } : x)) }));
    clearDraftHistory();
    oneStep(() => setScheduleScale(id, 100));
  });
});

describe('group scale and swapping a drawing (#51)', () => {
  it('a group scale is one step', () => oneStep(() => setGroupScale('plans' as never, 200, { min: { x: 100, z: 200 }, max: { x: 112, z: 210 } } as never)));
  it('swapping the view in a slot is one step', () => {
    const sheet = planSheet();
    const other = state().views.find((v) => v.id !== firstVp().viewId);
    assert.ok(other);
    oneStep(() => swapViewportView(sheet.id, firstVp().id, other.id));
  });
});
