/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #922: a Bonsai user saves the IFC again and opens it in a fresh tab. The autosave is filed under the file's content
 * hash, so the new version finds none and the project seemed gone. Through the real loader and the real project sync,
 * on the committed pair (`test/fixtures/reload/house-v1.ifc`, `house-v2.ifc`: the same IfcProject GlobalId, Wall B
 * moved, the door deleted): a project saved on v1 is offered when v2 opens fresh; Continue brings its sheets, views and
 * annotations onto v2 and reports the door's annotation; Start new leaves the earlier autosave as it was.
 */

import { hook, load, skip } from '@/test/blank-ifc-loader-harness.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act } from 'react';
import { cleanup, click, render } from '@/test/render.js';
import { editDrafts, newDraft } from '@/drafting/draft-store';
import { addProjectSheet, resetProject, setProjectName, useProjectStore } from '@/project/project-store';
import { addViewport } from '@/project/sheets';
import { endModelVersionSwap } from '@/project/model-version';
import { autosaveKey } from '@/project/project-saved';
import { loadedModels, useProjectSync } from '@/project/project-sync';
import { forgetEarlierProject, useEarlierProjectStore } from '@/project/earlier-project-store';
import { EarlierProjectOffer } from '@/components/viewer/wall/EarlierProjectOffer';
import { useViewerStore } from '@/store';
import { useWhatChanged } from './baseline.js';
import { continueEarlierProject, continueNotice } from './continue-earlier.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures', 'reload');
/** Both versions carry the authoring tool's file name: the file is saved over itself. */
const house = (version: 1 | 2) => new File([readFileSync(join(FIXTURES, `house-v${version}.ifc`))], 'house.ifc', { type: 'application/ifc' });
const WALL_A = '2fedArchWallA000000010';
const WALL_B = '2fedArchWallB000000010';
const DOOR = '2fedArchDoor0000000010';

function Sync() {
  useProjectSync();
  return null;
}

const settle = (ms = 50) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
/** Past the autosave's debounce, so what the project holds is in its slot. */
const autosaved = () => settle(700);

/** Opens v1 in a session, draws a sheet with three annotations on it, and lets it autosave; what it saved, and where. */
async function projectOnV1() {
  render(<Sync />);
  await load(house(1));
  await settle();
  setProjectName('House set');
  const plan = useProjectStore.getState().views.find((v) => v.kind === 'plan' && v.level.name === 'Level 0');
  assert.ok(plan, 'the project has a plan of Level 0');
  const sheetId = addProjectSheet('Ground floor');
  addViewport(sheetId, plan.id, { x: 200, y: 150 }, 50);
  const tagOf = (guid: string) => newDraft(plan.id, '0', { type: 'leader', pts: [{ x: 1, y: 1 }, { x: 2, y: 2 }], text: guid, height: 0.25 }, { tagOf: guid });
  const annotations = [tagOf(WALL_A), tagOf(WALL_B), tagOf(DOOR)];
  editDrafts({ add: annotations });
  await autosaved();
  const key = autosaveKey(loadedModels().refs);
  const slot = localStorage.getItem(key);
  assert.ok(slot, 'the project on v1 is autosaved');
  const { sheets, views } = useProjectStore.getState();
  return { key, slot, sheets, views, annotations };
}

/** A fresh tab: nothing loaded, an empty project, and v2 opened. */
async function freshTabWithV2() {
  cleanup();
  useViewerStore.getState().resetViewerState();
  useViewerStore.getState().clearAllModels();
  resetProject();
  forgetEarlierProject();
  render(<Sync />);
  await load(house(2));
  await settle();
}

beforeEach(() => {
  localStorage.clear();
  resetProject();
  endModelVersionSwap();
  forgetEarlierProject();
  useWhatChanged.setState({ result: null, running: false, message: null });
});
afterEach(() => { cleanup(); forgetEarlierProject(); localStorage.clear(); });

describe('#922: a fresh tab offers the project of an earlier version of the model', { skip }, () => {
  it('offers it, and Continue keeps the sheets, views and annotations, reporting the one whose element is gone', async () => {
    assert.ok(hook);
    const before = await projectOnV1();
    await freshTabWithV2();

    assert.equal(useProjectStore.getState().sheets.length, 0, 'the new version has no autosave of its own: an empty project is in front');
    const offer = useEarlierProjectStore.getState().offer;
    assert.ok(offer, 'the project of v1 is offered');
    assert.equal(offer.key, before.key, 'it is the v1 autosave');
    assert.equal(offer.doc.name, 'House set');
    const shown = render(<EarlierProjectOffer />);
    assert.match(shown.textContent ?? '', /Continue House set, saved .+, made from an earlier version of this model\?/);

    const outcome = await act(async () => continueEarlierProject());
    await settle();
    assert.ok(outcome);
    const after = useProjectStore.getState();
    assert.equal(after.name, 'House set');
    assert.deepEqual(after.sheets, before.sheets, 'the sheets are kept');
    assert.deepEqual(after.views, before.views, 'the views are kept');
    const kept = new Map(after.drafts.map((d) => [d.id, d]));
    for (const a of before.annotations) assert.ok(kept.has(a.id), `the annotation of ${a.params.tagOf} is kept`);
    assert.equal(kept.get(before.annotations[0].id)?.params.tagOf, WALL_A, 'still attached to its wall by GlobalId');
    assert.equal(outcome.lost, 1, 'the door\'s annotation is reported as having lost its element');
    assert.match(continueNotice(outcome, 'House set'), /1 annotation lost its element/);
    assert.deepEqual(after.models.map((m) => m.key), loadedModels().refs.map((r) => r.key), 'the project now refers to v2');
    assert.equal(useEarlierProjectStore.getState().offer, null, 'answered, the offer goes');

    await autosaved();
    assert.equal(localStorage.getItem(before.key), before.slot, 'the v1 autosave is not written over');
    assert.ok(localStorage.getItem(autosaveKey(loadedModels().refs)), 'the project goes on in the slot of v2');
  });

  it('Start new takes the offer away and leaves the earlier autosave intact', async () => {
    const before = await projectOnV1();
    await freshTabWithV2();
    const shown = render(<EarlierProjectOffer />);
    const startNew = [...shown.querySelectorAll('button')].find((b) => b.textContent === 'Start new');
    assert.ok(startNew, 'the offer has a Start new answer');
    await act(async () => click(startNew));
    assert.equal(useEarlierProjectStore.getState().offer, null);
    assert.equal(useProjectStore.getState().sheets.length, 0, 'the project in front stays the new one');
    addProjectSheet('A new start');
    await autosaved();
    assert.equal(localStorage.getItem(before.key), before.slot, 'the v1 autosave is as it was');
  });

  it('offers an autosave from before identities were kept only on its file name and a storey GlobalId in common', async () => {
    const before = await projectOnV1();
    // An older build kept no identity beside the slot. Levels are not saved: the plan views keep their storeys.
    for (const k of Object.keys(localStorage)) if (k.startsWith('ifc-lite:project-identity:v1:')) localStorage.removeItem(k);
    await freshTabWithV2();
    assert.equal(useEarlierProjectStore.getState().offer?.key, before.key, 'same file name, same storeys: offered');

    // The same name but none of its storeys: another building that happens to be called house.ifc.
    const doc = JSON.parse(before.slot) as { views: { level?: { storeyGlobalIds: string[] } }[] };
    for (const v of doc.views) if (v.level) v.level.storeyGlobalIds = ['0000000000000000000000'];
    localStorage.setItem(before.key, JSON.stringify(doc));
    await freshTabWithV2();
    assert.equal(useEarlierProjectStore.getState().offer, null, 'a file name alone is not offered');
  });
});
