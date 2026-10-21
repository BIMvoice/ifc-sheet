/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #131 x #106 in the integration branch: the tour hangs the set by the same
 * event the user's "Hang it" sends (`emitWallHung`). A hang is not an answer
 * to the recovery offer, so the tour run over an open offer must leave the
 * session that died on offer and restorable.
 */

import '@/test/setup-dom.js';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { act } from 'react';
import { cleanup, render } from '@/test/render.js';
import { fixtureModel, fixtureModels } from '@/test/store-fixture.js';
import { useViewerStore } from '@/store';
import { addProjectSheet, projectDocument, resetProject, useProjectStore } from '@/project/project-store';
import { defaultViews } from '@/project/view-defaults';
import { startDrawingSet } from '@/project/drawing-set-actions';
import type { ModelExtent } from '@/project/drawing-set';
import { markSessionOpen, planAutosave, recoverableKey, writeAutosave } from '@/project/recovery';
import { forgetRecoveryOffer, offerRecovery, restoreRecovery, useRecoveryStore } from '@/project/recovery-store';
import { WallView } from '@/components/viewer/wall/WallView.js';
import { stepInto } from '@/components/viewer/wall/wall-nav.js';
import { IFCSHEET_TOUR } from './ifcsheet.js';

const HOUSE: ModelExtent = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 6, z: 7 } };
const KEY = 'ifc-lite:project:v1:tour-recovery';
const initial = useViewerStore.getState();
const offered = () => useRecoveryStore.getState().offer?.doc.sheets.map((s) => s.name) ?? null;

beforeEach(async () => {
  window.localStorage.clear();
  window.localStorage.setItem('ifc-lite:tours:v1', JSON.stringify({ tours: {}, notices: { 'ifcsheet-tour': 'seen' } }));
  forgetRecoveryOffer();
  // The session that died: one sheet, autosaved, the tab gone without closing.
  resetProject();
  addProjectSheet('Before the crash');
  await writeAutosave(KEY, projectDocument());
  markSessionOpen(KEY);
  // The next start keeps it aside and offers it; the new session lays out its own set.
  resetProject();
  const plan = planAutosave(KEY);
  assert.ok(plan.recoverable);
  offerRecovery({ key: KEY, doc: plan.recoverable.doc, savedAt: plan.recoverable.savedAt, modelName: 'm' });
  const levels = [{ name: 'Ground Floor', elevation: 0, storeyGlobalIds: ['L0'] }];
  useProjectStore.setState({ levels, views: defaultViews(levels) });
  startDrawingSet(null, HOUSE);
  act(() => { useViewerStore.setState({ ...fixtureModels(fixtureModel('m')), loading: false, geometryStreamingActive: false }); });
});
afterEach(() => {
  cleanup();
  act(() => { stepInto(null); });
  useViewerStore.setState(initial);
  forgetRecoveryOffer();
  window.localStorage.clear();
});

describe('the IfcSheet tour over an open recovery offer', () => {
  it('hangs the set and steps through it without answering the offer: the old session is still restorable', async () => {
    render(<WallView />);
    assert.deepEqual(offered(), ['Before the crash']);
    for (const id of ['sheet', 'tools', 'issue']) {
      const step = IFCSHEET_TOUR.steps.find((s) => s.id === id);
      assert.ok(step?.prepare, id);
      await act(async () => { await step.prepare?.(useViewerStore as never); });
    }
    assert.deepEqual(offered(), ['Before the crash'], 'still on offer after the tour hung the set');
    assert.ok(window.localStorage.getItem(recoverableKey(KEY)), 'its slot is kept');
    act(() => { restoreRecovery(); });
    assert.deepEqual(useProjectStore.getState().sheets.map((s) => s.name), ['Before the crash']);
  });
});
