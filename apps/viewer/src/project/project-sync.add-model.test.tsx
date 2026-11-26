/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #863: a model added to a project being worked on must not replace that project. The architecture alone was opened
 * and its sections set to another scale; adding the structural model put back the autosave the two models had left
 * in an earlier session, and the edit was gone. The project in front carries on; the earlier one is offered back.
 *
 * Through the real sync hook, on the committed federated pair (`arch.ifc`, `str.ifc`) read by the real engines.
 */

import '@/test/setup-dom.js';
import { afterEach, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, render } from '@/test/render.js';
import { loadFederated, WASM_BUILT } from '@/test/federated-pair';
import { useViewerStore, type FederatedModel } from '@/store';
import { addProjectSheet, resetProject, useProjectStore } from './project-store.js';
import { useProjectSync } from './project-sync.js';
import { forgetRecoveryOffer, useRecoveryStore } from './recovery-store.js';

const FEDERATED = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures', 'federated');
const skip = WASM_BUILT ? false : 'wasm runtime not built (pnpm build:wasm or pnpm build:wasm:fetch)';

function Sync() {
  useProjectSync();
  return null;
}

let arch: FederatedModel;
let str: FederatedModel;

const wait = (ms = 700) => new Promise((r) => setTimeout(r, ms));
const sheetNames = () => useProjectStore.getState().sheets.map((s) => s.name);
const offerSheets = () => useRecoveryStore.getState().offer?.doc.sheets.map((s) => s.name) ?? null;
const show = (models: readonly FederatedModel[]) => useViewerStore.setState({ models: new Map(models.map((m) => [m.id, m])), activeModelId: models[0]?.id ?? null });

/** A new page: an empty project, then `models` load. */
function start(models: readonly FederatedModel[]): void {
  resetProject();
  forgetRecoveryOffer();
  show([]);
  render(<Sync />);
  show(models);
}

/** The page closes as a page does. */
function close(): void {
  window.dispatchEvent(new Event('pagehide'));
  cleanup();
}

before(async () => {
  if (skip) return;
  [arch, str] = await loadFederated([
    { id: 'arch', name: 'arch.ifc', bytes: new Uint8Array(readFileSync(join(FEDERATED, 'arch.ifc'))) },
    { id: 'str', name: 'str.ifc', bytes: new Uint8Array(readFileSync(join(FEDERATED, 'str.ifc'))) },
  ]);
});
beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); localStorage.clear(); show([]); });

describe('#863: a model added to the project in front', { skip }, () => {
  it('keeps the project in front and offers the one the models left earlier', async () => {
    // An earlier session on the two models, closed as a page closes: its project is autosaved under the pair.
    start([arch, str]);
    addProjectSheet('Earlier, on both models');
    await wait();
    close();

    // The architecture alone, worked on, then the structure added.
    start([arch]);
    addProjectSheet('Worked on, architecture alone');
    await wait();
    show([arch, str]);
    await wait();
    assert.deepEqual(sheetNames(), ['Worked on, architecture alone'], 'the work in front is kept');
    assert.deepEqual(offerSheets(), ['Earlier, on both models'], 'the earlier project of the pair is offered, not lost');
  });

  it('still opens the earlier project of the models when nothing was drawn yet', async () => {
    start([arch, str]);
    addProjectSheet('Earlier, on both models');
    await wait();
    close();

    start([arch]);
    show([arch, str]);
    await wait();
    assert.deepEqual(sheetNames(), ['Earlier, on both models'], 'the pair opens as it was left');
  });
});
