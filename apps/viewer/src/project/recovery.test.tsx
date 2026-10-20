/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #71: killing the tab and reopening offers the work back. The tab is simulated: the session marker
 * is set, an autosave is written, the project store is emptied (a new session), and the plan for the
 * same models is read again. `recovery-session.test.tsx` drives the same through the sync hook.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { watchProjectForAutosave } from './autosave-watch.js';
import assert from 'node:assert/strict';
import { snapshotFromElements } from '@/whatchanged/snapshot.js';
import { addProjectSheet, loadProjectDocument, PROJECT_DOCUMENT_KEYS, projectDocument, resetProject, useProjectStore } from './project-store.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { noteProjectFile, openProjectDocument, parseProjectFile } from './project-file.js';
import { autosaveKey } from './project-saved.js';
import { markSessionClosed, markSessionOpen, planAutosave, recoverableKey, writeAutosave } from './recovery.js';
import { discardRecovery, forgetRecoveryOffer, offerRecovery, restoreRecovery, useRecoveryStore } from './recovery-store.js';
import type { ProjectModelRef } from './types.js';

const MODELS: ProjectModelRef[] = [{ key: 'hash-house', name: 'house.ifc' }];
const KEY = autosaveKey(MODELS);

function fakeStorage() {
  const m = new Map<string, string>();
  return Object.assign(m, { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }) as Map<string, string> & Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
}

const SAVED_AT = new Date('2026-10-19T10:00:00Z');
const BEFORE = SAVED_AT.getTime() - 60_000;
const AFTER = SAVED_AT.getTime() + 60_000;

/** A session in which a sheet was drawn and the autosave written; `crashed` leaves the marker set, as a dead tab does. */
function session(storage: ReturnType<typeof fakeStorage>, crashed = true) {
  resetProject();
  markSessionOpen(KEY, storage);
  useProjectStore.setState({ models: MODELS });
  addProjectSheet('Plans');
  writeAutosave(KEY, projectDocument(), storage, SAVED_AT);
  if (!crashed) markSessionClosed(KEY, storage);
  resetProject();
}

/** Marks a session on `key` as having died, then writes `doc` as its autosave at `at`. */
function diedWith(storage: ReturnType<typeof fakeStorage>, key: string, at: number) {
  markSessionOpen(key, storage);
  writeAutosave(key, projectDocument(), storage, new Date(at));
}

describe('after a crash', () => {
  beforeEach(() => { resetProject(); forgetRecoveryOffer(); });

  it('keeps the autosave in a slot of its own and offers it, when no project file was ever saved', () => {
    const storage = fakeStorage();
    session(storage);
    const plan = planAutosave(KEY, storage);
    assert.equal(plan.recoverable?.savedAt, SAVED_AT.getTime());
    assert.equal(plan.restore, null, 'a new session starts empty');
    assert.ok(storage.get(recoverableKey(KEY)), 'kept in its own slot');
    assert.equal(storage.get(KEY), undefined, 'and out of the slot the next autosave writes');
    assert.equal(planAutosave(KEY, storage).recoverable?.savedAt, SAVED_AT.getTime(), 'still offered at the start after');
  });

  it('does not offer the autosave of a session that ended cleanly: it is put back', () => {
    const storage = fakeStorage();
    session(storage, false);
    const plan = planAutosave(KEY, storage);
    assert.equal(plan.recoverable, null);
    assert.deepEqual(plan.restore?.doc.sheets.map((s) => s.name), ['Plans']);
  });

  it('restoring puts the sheets back through the load path, as work not yet saved to a file, and removes the slot', () => {
    const storage = fakeStorage();
    session(storage);
    const plan = planAutosave(KEY, storage);
    assert.ok(plan.recoverable);
    offerRecovery({ key: KEY, doc: plan.recoverable.doc, savedAt: plan.recoverable.savedAt, modelName: 'house.ifc' });
    restoreRecovery(storage);
    const s = useProjectStore.getState();
    assert.deepEqual(s.sheets.map((x) => x.name), ['Plans']);
    assert.equal(s.dirty, true);
    assert.equal(useRecoveryStore.getState().offer, null);
    assert.equal(storage.get(recoverableKey(KEY)), undefined);
  });

  it('an autosave in the new session does not touch the kept one; Discard removes it', () => {
    const storage = fakeStorage();
    session(storage);
    const plan = planAutosave(KEY, storage);
    const kept = storage.get(recoverableKey(KEY));
    assert.ok(plan.recoverable && kept);
    offerRecovery({ key: KEY, doc: plan.recoverable.doc, savedAt: plan.recoverable.savedAt, modelName: 'house.ifc' });
    useProjectStore.setState({ models: MODELS });
    addProjectSheet('New session');
    writeAutosave(KEY, projectDocument(), storage, new Date(AFTER));
    assert.equal(storage.get(recoverableKey(KEY)), kept);
    discardRecovery(storage);
    assert.equal(useRecoveryStore.getState().offer, null);
    assert.equal(storage.get(recoverableKey(KEY)), undefined);
  });

  it('a second crash with a session already kept puts the newer autosave back and keeps offering the first', () => {
    const storage = fakeStorage();
    session(storage);
    planAutosave(KEY, storage);
    const kept = storage.get(recoverableKey(KEY));
    useProjectStore.setState({ models: MODELS, name: 'Second session' });
    diedWith(storage, KEY, AFTER);
    const plan = planAutosave(KEY, storage);
    assert.equal(plan.restore?.doc.name, 'Second session');
    assert.equal(storage.get(recoverableKey(KEY)), kept);
  });

  it('does not offer an autosave older than the project file saved after it', () => {
    const storage = fakeStorage();
    session(storage);
    useProjectStore.setState({ models: MODELS, name: 'Later edits' });
    noteProjectFile(projectDocument(), AFTER, storage);
    assert.equal(planAutosave(KEY, storage).recoverable, null);
  });

  it('offers an autosave newer than the project file, which holds something the file does not', () => {
    const storage = fakeStorage();
    resetProject();
    useProjectStore.setState({ models: MODELS });
    noteProjectFile(projectDocument(), BEFORE, storage);
    addProjectSheet('Drawn after the save');
    diedWith(storage, KEY, SAVED_AT.getTime());
    assert.ok(planAutosave(KEY, storage).recoverable);
  });

  it('does not offer the autosave that follows a project file being opened: newer, but the same', () => {
    const storage = fakeStorage();
    resetProject();
    useProjectStore.setState({ models: MODELS });
    addProjectSheet('Plans');
    noteProjectFile(projectDocument(), BEFORE, storage);
    diedWith(storage, KEY, SAVED_AT.getTime());
    assert.equal(planAutosave(KEY, storage).recoverable, null);
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
      diedWith(storage, key, afterOpen);
      resetProject();
      assert.equal(planAutosave(key, storage).recoverable, null);
      addProjectSheet('A sheet after the open');
      diedWith(storage, key, afterOpen + 1000);
      assert.ok(planAutosave(key, storage).recoverable, 'but one drawn after the open is');
    } finally {
      localStorage.clear();
    }
  });

  it('has nothing to offer when nothing was autosaved', () => {
    const storage = fakeStorage();
    markSessionOpen(KEY, storage);
    assert.deepEqual(planAutosave(KEY, storage), { restore: null, recoverable: null });
  });

  it('reads an autosave through the project file reader: a slot from a newer build is not offered or loaded', () => {
    const storage = fakeStorage();
    markSessionOpen(KEY, storage);
    useProjectStore.setState({ models: MODELS });
    writeAutosave(KEY, projectDocument(), storage, SAVED_AT);
    storage.set(KEY, JSON.stringify({ ...JSON.parse(storage.get(KEY) as string), version: 99 }));
    assert.deepEqual(planAutosave(KEY, storage), { restore: null, recoverable: null });
  });

  it('other models coming to the front forget the offer without removing the kept session', () => {
    const storage = fakeStorage();
    session(storage);
    const plan = planAutosave(KEY, storage);
    assert.ok(plan.recoverable);
    offerRecovery({ key: KEY, doc: plan.recoverable.doc, savedAt: 1, modelName: 'house.ifc' });
    forgetRecoveryOffer();
    assert.equal(useRecoveryStore.getState().offer, null);
    assert.ok(storage.get(recoverableKey(KEY)));
    loadProjectDocument(projectDocument());
  });
});

describe('what the autosave watches', () => {
  const written: string[] = [];
  let stop = () => {};
  beforeEach(() => {
    resetProject();
    forgetRecoveryOffer();
    written.length = 0;
    stop = watchProjectForAutosave(() => KEY, (key) => written.push(key), 5);
  });
  afterEach(() => stop());

  it('writes while a session is on offer: the offered one lives in its own slot', async () => {
    offerRecovery({ key: KEY, doc: projectDocument(), savedAt: 1, modelName: 'house.ifc' });
    addProjectSheet('Drawn while the offer is open');
    await new Promise((r) => setTimeout(r, 25));
    assert.deepEqual(written, [KEY]);
    assert.notEqual(useRecoveryStore.getState().offer, null, 'and the offer stays');
    forgetRecoveryOffer();
  });

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
