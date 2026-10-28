/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The recovery copy is zipped in a worker (#154), in the format it always had:
 * the same bytes as the page's own zip, a package an older build wrote still
 * opens, and a worker that cannot run or fails leaves the zip to the page.
 */

import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { strToU8, zipSync } from 'fflate';
import { buildPackage, readPackage, unzipPackage } from './package-io.js';
import { answerZipRequest, setZipWorkerFactoryForTests, zipPackage, zipPackageOffThread, type ZipReply, type ZipRequest, type ZipWorker } from './package-zip.js';
import type { ProjectDocument } from '../types.js';

const doc: ProjectDocument = { name: 'House', models: [{ key: 'arch', name: 'arch.ifc' }], views: [], sheets: [{ id: 'sh1', number: 'A-101', name: 'Plans', createdAt: 5 }], drafts: [], draftLayers: [] } as unknown as ProjectDocument;
const ifc = strToU8(`ISO-10303-21;\nHEADER;\n${'/* wall */\n'.repeat(5000)}ENDSEC;\nDATA;\nENDSEC;\nEND-ISO-10303-21;\n`);

const build = () => buildPackage({ projectId: 'prj-1', doc, now: new Date('2026-10-09T10:00:00Z'), models: [{ id: 'arch', name: 'arch.ifc', role: 'native', bytes: ifc }] });

/** A worker that answers on a later turn, behind a structuredClone as a real one is. */
function fakeWorker(log: { posts: number }, fail?: 'reply' | 'error'): ZipWorker {
  const w: ZipWorker = {
    onmessage: null, onerror: null, terminate: () => {},
    postMessage(message: ZipRequest) {
      log.posts++;
      const request = structuredClone(message);
      setTimeout(() => {
        if (fail === 'error') return void w.onerror?.({ message: 'boom' });
        const reply: ZipReply = fail === 'reply' ? { error: 'bad' } : answerZipRequest(request);
        w.onmessage?.({ data: structuredClone(reply) });
      }, 0);
    },
  };
  return w;
}

let restore: (() => void) | null = null;
beforeEach(() => { mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-09T10:00:00Z') }); });
afterEach(() => { restore?.(); restore = null; mock.timers.reset(); mock.restoreAll(); });

describe('the recovery copy zipped off the main thread', () => {
  it('is handed to a worker and comes back the same bytes the page would have made', async () => {
    const { files } = await build();
    const log = { posts: 0 };
    restore = setZipWorkerFactoryForTests(() => fakeWorker(log));
    const viaWorker = await zipPackageOffThread(files);
    assert.equal(log.posts, 1, 'the worker did the zip');
    assert.deepEqual(viaWorker, zipPackage(files));
  });

  it('restores correctly', async () => {
    const { files, manifest } = await build();
    restore = setZipWorkerFactoryForTests(() => fakeWorker({ posts: 0 }));
    const opened = await readPackage(unzipPackage(await zipPackageOffThread(files)));
    assert.equal(opened.manifest.projectId, manifest.projectId);
    assert.deepEqual(opened.models[0]?.bytes, ifc);
    assert.deepEqual(opened.doc.sheets.map((s) => s.name), ['Plans']);
  });

  it('opens a package an older build zipped on the page', async () => {
    const { files } = await build();
    // The recipe before the worker: zipSync, level 6 for .ifc and .json, stored otherwise.
    const old = zipSync(Object.fromEntries([...files].map(([p, b]) => [p, [b, { level: p.endsWith('.ifc') || p.endsWith('.json') ? 6 : 0 }]])) as Parameters<typeof zipSync>[0]);
    const opened = await readPackage(unzipPackage(old));
    assert.deepEqual(opened.models[0]?.bytes, ifc);
    assert.deepEqual(old, zipPackage(files), 'and the format has not moved');
  });

  it('zips on the page where no worker can run', async () => {
    const { files } = await build();
    restore = setZipWorkerFactoryForTests(null);
    assert.deepEqual(await zipPackageOffThread(files), zipPackage(files));
  });

  for (const fail of ['reply', 'error'] as const) {
    it(`zips on the page when the worker fails (${fail})`, async () => {
      const { files } = await build();
      const log = { posts: 0 };
      mock.method(console, 'warn', () => {});
      restore = setZipWorkerFactoryForTests(() => fakeWorker(log, fail));
      assert.deepEqual(await zipPackageOffThread(files), zipPackage(files));
      assert.equal(log.posts, 1);
    });
  }
});
