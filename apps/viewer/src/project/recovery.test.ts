/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #71: killing the tab and reopening offers the work back. The tab is simulated: an autosave is
 * written, the project store is emptied (a new session), and the same models load again.
 */

import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addProjectSheet, loadProjectDocument, projectDocument, resetProject, useProjectStore } from './project-store.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { noteProjectFile, parseProjectFile } from './project-file.js';
import { autosaveKey } from './project-saved.js';
import { planAutosave, writeAutosave } from './recovery.js';
import { discardRecovery, offerRecovery, recoveryOpenFor, restoreRecovery, useRecoveryStore } from './recovery-store.js';
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
    const g = globalThis as { localStorage?: unknown };
    const had = g.localStorage;
    g.localStorage = storage;
    try {
      const file = readFileSync(fileURLToPath(new URL('./fixtures/v1.ifclite-project.json', import.meta.url)), 'utf8');
      loadProjectDocument(parseProjectFile(file));
      const key = autosaveKey(useProjectStore.getState().models);
      writeAutosave(key, projectDocument(), storage, new Date(AFTER));
      resetProject();
      assert.equal(planAutosave(key, storage).kind, 'restore');
      addProjectSheet('A sheet after the open');
      writeAutosave(key, projectDocument(), storage, new Date(AFTER + 1000));
      assert.equal(planAutosave(key, storage).kind, 'offer', 'but one drawn after the open is');
    } finally {
      g.localStorage = had;
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
