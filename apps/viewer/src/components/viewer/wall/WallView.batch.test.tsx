/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #863: files opened together are one batch. While it loads the Wall names every file and lays no set out; when the
 * last file is in (or failed) the set is laid out once, from all of them. Before, the set of the first model was laid
 * out (and its views drawn) and then laid out again when the second arrived.
 *
 * The committed federated pair (`arch.ifc`, `str.ifc`) is meshed by the real engines; the files go through the real
 * batch loader (`loadAsBatch`), whose `addOne` puts each model in the viewer as the loader does.
 */

import '@/test/setup-dom.js';
import { installLayout } from '@/test/dom-layout.js';
installLayout();
import { act, useEffect } from 'react';
import { afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, render } from '@/test/render.js';
import { loadFederated, WASM_BUILT } from '@/test/federated-pair';
import { useFederatedGeometry } from '@/components/viewer/useFederatedGeometry';
import { modelIndices } from '@/lib/model-placement/model-indices';
import { publishDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { loadAsBatch, useLoadBatch } from '@/hooks/ingest/load-batch';
import { isSetSheet } from '@/project/drawing-set';
import { useProjectSync } from '@/project/project-sync';
import { resetProject, useProjectStore } from '@/project/project-store';
import { useViewerStore, type FederatedModel } from '@/store';
import { WallView } from './WallView';

const FEDERATED = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'test', 'fixtures', 'federated');
const skip = WASM_BUILT ? false : 'wasm runtime not built (pnpm build:wasm or pnpm build:wasm:fetch)';

/** The federated mesh set published as the drawing runtime, as `DrawingRuntimeHost` publishes it. */
function Runtime(): null {
  const models = useViewerStore((s) => s.models);
  const geometryResult = useFederatedGeometry(models, null, modelIndices(models), 0);
  useEffect(() => {
    publishDrawingRuntime({ geometryResult, sourceCoordinateInfo: geometryResult?.coordinateInfo, generateDrawing: async () => {}, isRegenerating: false });
  }, [geometryResult]);
  return null;
}

let arch: FederatedModel;
let str: FederatedModel;

/** The project follows the models, as the navigator mounts it in the app. */
function Sync(): null {
  useProjectSync();
  return null;
}

/** Put `models` in the viewer, as the loader does when a model arrives. */
function arrive(models: readonly FederatedModel[]): void {
  useViewerStore.setState({ models: new Map(models.map((m) => [m.id, m])), activeModelId: models[0]?.id ?? null });
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

/** The set as a person reads it: every view and every sheet, without ids or dates. */
function theSet(): unknown {
  const { views, sheets } = useProjectStore.getState();
  const plain = (o: object) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'id' || k === 'createdAt' || k === 'templateId' || k === 'viewId' ? undefined : k === 'storeyGlobalIds' ? [...v].sort() : typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
  return { views: views.map(plain).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))), sheets: sheets.filter(isSetSheet).map(plain) };
}

/** How many times a set is laid out: each time the project goes from no set sheet to some. */
function countLayouts(): { count: () => number; stop: () => void } {
  let count = 0;
  let had = useProjectStore.getState().sheets.some(isSetSheet);
  const stop = useProjectStore.subscribe((s) => {
    const has = s.sheets.some(isSetSheet);
    if (has && !had) count++;
    had = has;
  });
  return { count: () => count, stop };
}

const file = (name: string, size: number) => new File([new Uint8Array(size)], name);

interface Opened { layouts: number; during: { sheets: number; rows: string[] }; set: unknown }

/**
 * Open `models` (and, when `broken` is given, a file that does not load, second) as one batch on the start page.
 * Before the last file is let through, read what the Wall shows.
 */
async function openTogether(models: readonly FederatedModel[], broken?: string): Promise<Opened> {
  resetProject();
  localStorage.clear();
  useLoadBatch.setState({ batch: null });
  useViewerStore.setState({ models: new Map(), activeModelId: null });
  render(<><Sync /><Runtime /><WallView /></>);
  const layouts = countLayouts();
  const files = [file(models[0].name, 10), ...(broken ? [file(broken, 20)] : []), ...models.slice(1).map((m, i) => file(m.name, 30 + i))];
  let release!: () => void;
  const last = new Promise<void>((r) => { release = r; });
  let arrived = 0;
  const loading = loadAsBatch(files, async (f, i) => {
    if (f.name === broken) throw new Error('not an IFC file');
    if (i === files.length - 1) await last;
    arrived++;
    arrive(models.slice(0, arrived));
    return models[arrived - 1].id;
  });
  // The first model is in, the last one still loading.
  await settle();
  const during = {
    sheets: useProjectStore.getState().sheets.filter(isSetSheet).length,
    rows: [...document.querySelectorAll('[data-testid="wall-batch"] li')].map((li) => `${li.textContent} ${li.getAttribute('data-state')}`),
  };
  release();
  await act(async () => { await loading; });
  await settle();
  layouts.stop();
  return { layouts: layouts.count(), during, set: theSet() };
}

/** The set of `models` all in the viewer at once, no batch: what one layout from all of them gives. */
async function allAtOnce(models: readonly FederatedModel[]): Promise<unknown> {
  resetProject();
  localStorage.clear();
  useLoadBatch.setState({ batch: null });
  arrive(models);
  render(<><Sync /><Runtime /><WallView /></>);
  await settle();
  const set = theSet();
  cleanup();
  return set;
}

before(async () => {
  if (skip) return;
  [arch, str] = await loadFederated([
    { id: 'arch', name: 'arch.ifc', bytes: new Uint8Array(readFileSync(join(FEDERATED, 'arch.ifc'))) },
    { id: 'str', name: 'str.ifc', bytes: new Uint8Array(readFileSync(join(FEDERATED, 'str.ifc'))) },
  ]);
});
afterEach(() => {
  cleanup();
  publishDrawingRuntime(null);
  useLoadBatch.setState({ batch: null });
});

describe('#863: files opened together are one batch', { skip }, () => {
  it('lays the set out once, after the last file, in either order', async () => {
    const strTogether = await allAtOnce([str, arch]);
    const strFirst = await openTogether([str, arch]);
    cleanup();
    const archTogether = await allAtOnce([arch, str]);
    const archFirst = await openTogether([arch, str]);

    for (const [label, run] of [['structure first', strFirst], ['architecture first', archFirst]] as const) {
      assert.equal(run.during.sheets, 0, `${label}: no set while the batch loads`);
      assert.equal(run.during.rows.length, 2, `${label}: both files named while the batch loads`);
      assert.match(run.during.rows[0], /loaded$/, `${label}: the first file is read`);
      assert.match(run.during.rows[1], /loading$/, `${label}: the second file is being read`);
      assert.equal(run.layouts, 1, `${label}: the set is laid out once`);
    }
    assert.deepEqual(strFirst.set, strTogether, 'structure first: the set of both models');
    assert.deepEqual(archFirst.set, archTogether, 'architecture first: the set of both models');
  });

  it('names a file that does not load and lays the set out from the others', async () => {
    const run = await openTogether([arch, str], 'notes.ifc');
    assert.equal(run.during.sheets, 0, 'no set while the batch loads');
    assert.deepEqual(run.during.rows.map((r) => r.split(' ').pop()), ['loaded', 'failed', 'loading']);
    assert.equal(run.layouts, 1, 'the set is laid out once, after the last file');
    assert.ok((run.set as { sheets: unknown[] }).sheets.length > 0, 'the set is there');
    const alert = document.querySelector('[role="alert"]')?.textContent ?? '';
    assert.match(alert, /notes\.ifc/, 'the file that did not load is named');
  });
});
