/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #71: killing the tab and reopening offers the work back. The tab is simulated: an autosave is
 * written, the project store is emptied (a new session), and the same models load again.
 */

import '@/test/setup-dom.js';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { cleanup, render } from '@/test/render.js';
import { RecoveryOffer } from '@/components/viewer/wall/RecoveryOffer';
import { watchProjectForAutosave } from './autosave-watch.js';
import assert from 'node:assert/strict';
import { snapshotFromElements } from '@/whatchanged/snapshot.js';
import { addProjectSheet, loadProjectDocument, PROJECT_DOCUMENT_KEYS, projectDocument, resetProject, useProjectStore } from './project-store.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { noteProjectFile, openProjectDocument, parseProjectFile } from './project-file.js';
import { autosaveKey } from './project-saved.js';
import { planAutosave, writeAutosave } from './recovery.js';
import { discardRecovery, duringSystemChange, offerRecovery, recoveryOpenFor, restoreRecovery, startSetUnderOffer, useRecoveryStore } from './recovery-store.js';
import type { ProjectModelRef } from './types.js';

const MODELS: ProjectModelRef[] = [{ key: 'hash-house', name: 'house.ifc' }];
const KEY = autosaveKey(MODELS);

function fakeStorage() {
  const m = new Map<string, string>();
  return Object.assign(m, { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }) as Map<string, string> & Pick<Storage, 'getItem' | 'setItem'>;
}

const SAVED_AT = new Date('2026-10-19T10:00:00Z');
const BEFORE = SAVED_AT.getTime() - 60_000;
const AFTER = SAVED_AT.getTime() + 60_000;

/** A session in which a sheet was drawn and the autosave written, then the tab died. */
function crashedSession(storage: ReturnType<typeof fakeStorage>) {
  resetProject();
  useProjectStore.setState({ models: MODELS });
  addProjectSheet('Plans');
  writeAutosave(KEY, projectDocument(), storage, SAVED_AT);
  resetProject();
}

describe('after a crash', () => {
  beforeEach(() => { resetProject(); discardRecovery(); });

  it('offers the autosave when no project file was ever saved', () => {
    const storage = fakeStorage();
    crashedSession(storage);
    const plan = planAutosave(KEY, storage);
    assert.equal(plan.kind, 'offer');
    assert.ok(plan.kind === 'offer' && plan.autosave.savedAt === SAVED_AT.getTime());
    assert.equal(useProjectStore.getState().sheets.length, 0, 'a new session starts empty');
  });

  it('restoring puts the sheets back through the load path, as work not yet saved to a file', () => {
    const storage = fakeStorage();
    crashedSession(storage);
    const plan = planAutosave(KEY, storage);
    assert.equal(plan.kind, 'offer');
    if (plan.kind !== 'offer') return;
    offerRecovery({ key: KEY, doc: plan.autosave.doc, savedAt: plan.autosave.savedAt, modelName: 'house.ifc' });
    assert.equal(recoveryOpenFor(KEY), true);
    restoreRecovery();
    const s = useProjectStore.getState();
    assert.deepEqual(s.sheets.map((x) => x.name), ['Plans']);
    assert.equal(s.dirty, true);
    assert.equal(useRecoveryStore.getState().offer, null);
  });

  it('discarding leaves the autosave where it is, until the next autosave overwrites it', () => {
    const storage = fakeStorage();
    crashedSession(storage);
    const before = storage.get(KEY);
    offerRecovery({ key: KEY, doc: projectDocument(), savedAt: SAVED_AT.getTime(), modelName: 'house.ifc' });
    discardRecovery();
    assert.equal(useRecoveryStore.getState().offer, null);
    assert.equal(storage.get(KEY), before, 'nothing deleted by a click');
    assert.equal(planAutosave(KEY, storage).kind, 'offer', 'and it is offered again if the models are opened again');
    writeAutosave(KEY, projectDocument(), storage, new Date(AFTER));
    assert.notEqual(storage.get(KEY), before);
  });

  it('does not offer an autosave older than the project file saved after it', () => {
    const storage = fakeStorage();
    crashedSession(storage);
    useProjectStore.setState({ models: MODELS, name: 'Later edits' });
    noteProjectFile(projectDocument(), AFTER, storage);
    assert.equal(planAutosave(KEY, storage).kind, 'restore');
  });

  it('offers an autosave newer than the project file, which holds something the file does not', () => {
    const storage = fakeStorage();
    resetProject();
    useProjectStore.setState({ models: MODELS });
    noteProjectFile(projectDocument(), BEFORE, storage);
    addProjectSheet('Drawn after the save');
    writeAutosave(KEY, projectDocument(), storage, SAVED_AT);
    assert.equal(planAutosave(KEY, storage).kind, 'offer');
  });

  it('does not offer the autosave that follows a project file being opened: newer, but the same', () => {
    const storage = fakeStorage();
    resetProject();
    useProjectStore.setState({ models: MODELS });
    addProjectSheet('Plans');
    noteProjectFile(projectDocument(), BEFORE, storage);
    writeAutosave(KEY, projectDocument(), storage, SAVED_AT);
    assert.equal(planAutosave(KEY, storage).kind, 'restore');
  });

  it('does not offer, in a new session, the autosave of a project file that was opened and then left as it was', () => {
    const storage = fakeStorage();
    localStorage.clear();
    try {
      const file = readFileSync(fileURLToPath(new URL('./fixtures/v1.ifclite-project.json', import.meta.url)), 'utf8');
      openProjectDocument(parseProjectFile(file));
      // The open is stamped with the real clock, so the autosaves come after it on that clock too.
      const afterOpen = Date.now() + 60_000;
      const key = autosaveKey(useProjectStore.getState().models);
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i) as string; storage.setItem(k, localStorage.getItem(k) as string); }
      writeAutosave(key, projectDocument(), storage, new Date(afterOpen));
      resetProject();
      assert.equal(planAutosave(key, storage).kind, 'restore');
      addProjectSheet('A sheet after the open');
      writeAutosave(key, projectDocument(), storage, new Date(afterOpen + 1000));
      assert.equal(planAutosave(key, storage).kind, 'offer', 'but one drawn after the open is');
    } finally {
      localStorage.clear();
    }
  });

  it('has nothing to offer when nothing was autosaved', () => {
    assert.equal(planAutosave(KEY, fakeStorage()).kind, 'none');
  });

  it('reads an autosave through the project file reader: a slot from a newer build is not offered or loaded', () => {
    const storage = fakeStorage();
    crashedSession(storage);
    storage.set(KEY, JSON.stringify({ ...JSON.parse(storage.get(KEY) as string), version: 99 }));
    assert.equal(planAutosave(KEY, storage).kind, 'none');
  });

  it('keeps the offer for one set of models only', () => {
    offerRecovery({ key: KEY, doc: projectDocument(), savedAt: 1, modelName: 'house.ifc' });
    assert.equal(recoveryOpenFor(autosaveKey([{ key: 'other', name: 'other.ifc' }])), false);
    loadProjectDocument(projectDocument());
    discardRecovery();
  });
});

describe('an offer left open while the user works', () => {
  const written: string[] = [];
  let stop = () => {};
  beforeEach(() => {
    resetProject();
    discardRecovery();
    written.length = 0;
    stop = watchProjectForAutosave(() => KEY, (key) => written.push(key), 5);
  });
  afterEach(() => stop());
  const wait = () => new Promise((r) => setTimeout(r, 30));
  const open = () => offerRecovery({ key: KEY, doc: projectDocument(), savedAt: 1, modelName: 'house.ifc' });

  it('ends at the first edit, which is then autosaved', async () => {
    open();
    addProjectSheet('Drawn while the offer was open');
    assert.equal(useRecoveryStore.getState().offer, null);
    await wait();
    assert.deepEqual(written, [KEY]);
  });

  it('is not ended, and nothing is written, by the app laying out the set itself', async () => {
    open();
    duringSystemChange(() => addProjectSheet('Laid out'));
    await wait();
    assert.notEqual(useRecoveryStore.getState().offer, null);
    assert.deepEqual(written, []);
  });

  it('ends when there is no set to lay out an intro for, and autosave is not suppressed', async () => {
    open();
    assert.equal(startSetUnderOffer(() => false), false);
    assert.equal(useRecoveryStore.getState().offer, null);
    addProjectSheet('Drawn');
    await wait();
    assert.deepEqual(written, [KEY]);
  });

  it('survives React\'s development double-mount, which unmounts and mounts again at once', async () => {
    open();
    render(<StrictMode><RecoveryOffer onRestored={() => {}} /></StrictMode>);
    await wait();
    assert.notEqual(useRecoveryStore.getState().offer, null);
    cleanup();
  });

  it('ends when the intro showing it goes away unanswered, and autosave resumes', async () => {
    open();
    const ui = render(<RecoveryOffer onRestored={() => {}} />);
    assert.notEqual(useRecoveryStore.getState().offer, null);
    ui.remove();
    cleanup();
    await wait();
    assert.equal(useRecoveryStore.getState().offer, null);
    addProjectSheet('Drawn');
    await wait();
    assert.deepEqual(written, [KEY]);
  });
});

describe('what the autosave watches', () => {
  const written: string[] = [];
  let stop = () => {};
  beforeEach(() => {
    resetProject();
    discardRecovery();
    written.length = 0;
    stop = watchProjectForAutosave(() => KEY, (key) => written.push(key), 5);
  });
  afterEach(() => stop());

  it('is every field the project file saves: changing any one of them alone is autosaved', async () => {
    for (const key of PROJECT_DOCUMENT_KEYS) {
      written.length = 0;
      const old: unknown = useProjectStore.getState()[key];
      const next = key === 'modelState' ? snapshotFromElements([{ k: 'G1'.padEnd(22, 'x'), t: 'IfcWall', n: 'W', d: 'abcdef0123', g: 'a1b2c3d4e', a: [0, 0, 0, 1, 1, 1] }], 1)
        : typeof old === 'string' ? `${old}x` : Array.isArray(old) ? [...old] : { ...(old as object | undefined) };
      useProjectStore.setState({ [key]: next });
      await new Promise((r) => setTimeout(r, 25));
      assert.deepEqual(written, [KEY], `a change to ${key} alone`);
    }
  });

  it('is the same list the saved document is built from', () => {
    // Fields that exist only once set (a PR's optional additions): absent from a fresh project's document, present once the store holds them.
    const OPTIONAL = new Set<string>(['modelState', 'siteArea', 'tagFields', 'titleBlockSources', 'sheetNumbering', 'phaseSource', 'graphicStandard']);
    const cleared = Object.fromEntries([...OPTIONAL].map((k) => [k, undefined]));
    assert.deepEqual(Object.keys(projectDocument({ ...useProjectStore.getState(), ...cleared })).sort(), PROJECT_DOCUMENT_KEYS.filter((k) => !OPTIONAL.has(k)).sort());
    const set = Object.fromEntries([...OPTIONAL].map((k) => [k, k === 'siteArea' ? 1 : {}]));
    assert.deepEqual(Object.keys(projectDocument({ ...useProjectStore.getState(), ...set })).sort(), [...PROJECT_DOCUMENT_KEYS].sort());
    assert.ok(Object.keys(projectDocument({ ...useProjectStore.getState(), modelState: undefined })).length > 20);
  });
});
