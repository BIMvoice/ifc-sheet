/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The recovery copy is written without zipping on the main thread (#154), and
 * what lands in the browser's storage is the package it always was: it reads
 * back through the same reader that opens a recovered project.
 */

import '@/test/setup-dom.js';
import 'fake-indexeddb/auto';
import { act } from 'react';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render } from '@/test/render.js';
import { useViewerStore } from '@/store';
import { resetProject } from '@/project/project-store';
import { readPackage, unzipPackage } from '@/project/package/package-io';
import { answerZipRequest, setZipWorkerFactoryForTests, type ZipWorker } from '@/project/package/package-zip';
import { clearRecovery } from '@/project/package/recovery';
import { idbRun, STORES } from '@/project/package/vault-idb';
import { useAutosaveRecovery } from './useAutosaveRecovery.js';

/** The slot as stored (fake-indexeddb keeps no content for happy-dom's Blob, so the bytes are checked from the worker's reply). */
const readSlot = () => idbRun<{ bytes: Blob; name: string } | undefined>(STORES.recovery, 'readonly', (s) => s.get('current') as IDBRequest<{ bytes: Blob; name: string } | undefined>);

function Host() { useAutosaveRecovery(); return null; }

let posts = 0;
let zipped: Uint8Array | null = null;
let restore: (() => void) | null = null;

beforeEach(() => {
  posts = 0;
  zipped = null;
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse('2026-10-09T10:00:00Z') });
  resetProject();
  restore = setZipWorkerFactoryForTests(() => {
    const w: ZipWorker = {
      onmessage: null, onerror: null, terminate: () => {},
      postMessage(message) {
        posts++;
        const reply = answerZipRequest(structuredClone(message));
        if ('bytes' in reply) zipped = reply.bytes;
        queueMicrotask(() => w.onmessage?.({ data: reply }));
      },
    };
    return w;
  });
});
afterEach(async () => {
  cleanup();
  restore?.();
  mock.timers.reset();
  await clearRecovery();
  useViewerStore.setState({ models: new Map() });
});

describe('the recovery autosave', () => {
  it('zips in the worker and stores a package that restores', async () => {
    useViewerStore.setState({ models: new Map() });
    render(<Host />);
    // One linked model: packaged as a reference, so no IFC export is needed to exercise the zip.
    const model = { id: 'm1', name: 'arch.ifc', linked: true, ifcDataStore: {} } as never;
    await act(async () => { useViewerStore.setState({ models: new Map([['m1', model]]), mutationVersion: 1 }); });
    await act(async () => { mock.timers.tick(8_000); });
    // Real IndexedDB work runs on real turns; let the write finish.
    mock.timers.reset();
    for (let i = 0; i < 50 && !(await readSlot()); i++) await new Promise((r) => setImmediate(r));
    assert.equal(posts, 1, 'the zip went to the worker');
    const stored = await readSlot();
    assert.ok(stored, 'a recovery copy was written');
    assert.ok(zipped, 'the worker returned the package');
    const opened = await readPackage(unzipPackage(zipped));
    assert.deepEqual(opened.models.map((m) => [m.model.name, m.model.role]), [['arch.ifc', 'linked']]);
  });
});
