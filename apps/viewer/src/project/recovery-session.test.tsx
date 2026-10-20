/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #71, through the real sync hook: a session that dies is offered back at the next start, and the
 * offer survives everything short of an explicit Discard or a successful Restore. A crash is
 * simulated as the browser leaves it: localStorage exactly as it was mid-session, with no unload.
 */

import '@/test/setup-dom.js';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render } from '@/test/render.js';
import { useViewerStore } from '@/store';
import { addProjectSheet, resetProject, useProjectStore } from './project-store.js';
import { useProjectSync } from './project-sync.js';
import { discardRecovery, forgetRecoveryOffer, restoreRecovery, useRecoveryStore } from './recovery-store.js';

/** The single-model (legacy) path of `loadedModels`: a data store with no storeys. */
const DATA_STORE = { spatialHierarchy: null, entities: { getName: () => null, getGlobalId: () => '' } };

function Sync() {
  useProjectSync();
  return null;
}

const wait = (ms = 700) => new Promise((r) => setTimeout(r, ms));
const sheetNames = () => useProjectStore.getState().sheets.map((s) => s.name);
const offerSheets = () => useRecoveryStore.getState().offer?.doc.sheets.map((s) => s.name) ?? null;

/** A new page: an empty project, then the same model loads. */
function start(): void {
  resetProject();
  forgetRecoveryOffer();
  useViewerStore.setState({ models: new Map(), ifcDataStore: null } as never);
  render(<Sync />);
  useViewerStore.setState({ ifcDataStore: DATA_STORE } as never);
}

/** The page closes as a page does: unload fires (here, the hook unmounts). */
function closeCleanly(): void {
  window.dispatchEvent(new Event('pagehide'));
  cleanup();
}

/** The tab dies: no unload, and storage stays as the running session left it. */
function crash(): void {
  const left = new Map(Object.entries({ ...localStorage }));
  cleanup();
  localStorage.clear();
  for (const [k, v] of left) localStorage.setItem(k, v);
}

describe('a session that crashed, at the next start', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('is offered; going on (an edit, its autosave, another start) does not lose it; Restore brings it back', async () => {
    start();
    addProjectSheet('Before the crash');
    await wait();
    crash();

    start();
    assert.deepEqual(offerSheets(), ['Before the crash'], 'offered');
    assert.deepEqual(sheetNames(), [], 'the new session starts empty');
    // Hanging the set and the first edit go on without answering; the edit is autosaved.
    addProjectSheet('Drawn in the new session');
    await wait();
    assert.deepEqual(offerSheets(), ['Before the crash'], 'still on offer after the first edit and its autosave');
    closeCleanly();

    start();
    assert.deepEqual(offerSheets(), ['Before the crash'], 'still on offer in a later session');
    restoreRecovery();
    assert.deepEqual(sheetNames(), ['Before the crash']);
    assert.equal(useRecoveryStore.getState().offer, null);
    await wait();
    closeCleanly();

    start();
    assert.equal(useRecoveryStore.getState().offer, null, 'a restored session is not offered again');
    assert.deepEqual(sheetNames(), ['Before the crash'], 'and is the project the autosave holds now');
  });

  it('Discard removes it for good', async () => {
    start();
    addProjectSheet('Before the crash');
    await wait();
    crash();

    start();
    assert.deepEqual(offerSheets(), ['Before the crash']);
    discardRecovery();
    assert.equal(useRecoveryStore.getState().offer, null);
    closeCleanly();

    start();
    assert.equal(useRecoveryStore.getState().offer, null);
    assert.ok(!Object.keys({ ...localStorage }).some((k) => k.includes('recoverable')), 'nothing is kept for it');
  });
});

describe('a session that ended cleanly', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { cleanup(); localStorage.clear(); });

  it('is not offered: its autosave is put back as it always was', async () => {
    start();
    addProjectSheet('Drawn, never saved to a file');
    await wait();
    closeCleanly();

    start();
    assert.equal(useRecoveryStore.getState().offer, null);
    assert.deepEqual(sheetNames(), ['Drawn, never saved to a file']);
  });
});

describe('a browser that blocks storage', () => {
  const own = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  afterEach(() => {
    cleanup();
    if (own) Object.defineProperty(globalThis, 'localStorage', own);
  });

  it('still loads the models: no throw, no offer', () => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } });
    assert.doesNotThrow(() => start());
    assert.deepEqual(useProjectStore.getState().models.map((m) => m.key), ['legacy']);
    assert.equal(useRecoveryStore.getState().offer, null);
    assert.doesNotThrow(() => closeCleanly());
  });
});
