/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #863: two models opened together load one after the other, and the Wall laid the starting set out as soon as the
 * first was in, so a two-model project got a set measured on whichever model arrived first. The set must be the one
 * the two models give together, in either arrival order; and a set the person has already worked on is kept.
 *
 * The committed federated pair (`arch.ifc`, two levels; `str.ifc`, one level at the same height as the first, standing
 * 100 m away) is meshed by the real engines, and the real Wall is mounted on the federated geometry, as in the app.
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
import { isSetSheet } from '@/project/drawing-set';
import { modelLevels } from '@/project/model-levels';
import { modelRef } from '@/project/project-sync';
import { renameProjectItem, resetProject, syncProjectWithModels, useProjectStore } from '@/project/project-store';
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

/** Put `models` in the viewer and sync the project, as the loader and `useProjectSync` do when a model arrives. */
function arrive(models: readonly FederatedModel[]): void {
  useViewerStore.setState({ models: new Map(models.map((m) => [m.id, m])), activeModelId: models[0]?.id ?? null });
  syncProjectWithModels(models.map(modelRef), models.flatMap((m) => modelLevels(m.id)));
}

/** Let the Wall settle: its snapshot is taken a task later (`useNextTaskValue`), and the set follows it. */
async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

/** The set as a person reads it: every view with what places it, every sheet with what it holds; no ids, no dates. */
function theSet(): unknown {
  const { views, sheets } = useProjectStore.getState();
  const nameOf = (id: string) => views.find((v) => v.id === id)?.name ?? `missing ${id}`;
  const round = (n: unknown) => (typeof n === 'number' ? Math.round(n * 1000) / 1000 : n);
  const plain = (o: object) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'id' || k === 'createdAt' || k === 'templateId' ? undefined : k === 'storeyGlobalIds' ? [...v].sort() : round(v))));
  return {
    views: views.map(plain).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    sheets: sheets.filter(isSetSheet).map((s) => ({ ...plain({ ...s, viewports: undefined }), viewports: (s.viewports ?? []).map((vp) => ({ ...plain({ ...vp, viewId: undefined }), view: nameOf(vp.viewId) })) })),
  };
}

/** Open `first`, let the Wall lay its set out, then `second` arrives; returns the set before and after. */
async function oneAfterTheOther(first: FederatedModel, second: FederatedModel, between?: () => void): Promise<{ before: unknown; after: unknown }> {
  resetProject();
  arrive([first]);
  render(<><Runtime /><WallView /></>);
  await settle();
  assert.ok(useProjectStore.getState().sheets.some(isSetSheet), 'the set is laid out on the first model');
  const before = theSet();
  between?.();
  arrive([first, second]);
  await settle();
  return { before, after: theSet() };
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
});

describe('#863: the starting set of two models opened together', { skip }, () => {
  it('is the set of both models, whichever arrives first', async () => {
    resetProject();
    arrive([arch, str]);
    render(<><Runtime /><WallView /></>);
    await settle();
    const together = theSet();
    cleanup();

    const archFirst = await oneAfterTheOther(arch, str);
    cleanup();
    const strFirst = await oneAfterTheOther(str, arch);

    // The pair is a fair test: a set laid out on one model alone is not the set of the two.
    assert.notDeepEqual(archFirst.before, together, 'the architecture alone gives another set');
    assert.notDeepEqual(strFirst.before, together, 'the structure alone gives another set');
    assert.deepEqual(archFirst.after, together, 'architecture first, then structure');
    assert.deepEqual(strFirst.after, together, 'structure first, then architecture');
  });

  it('keeps a set the person has already worked on', async () => {
    const { before: kept, after } = await oneAfterTheOther(str, arch, () => {
      const sheet = useProjectStore.getState().sheets.find(isSetSheet);
      assert.ok(sheet);
      renameProjectItem(sheet.id, 'Structure only');
    });
    const sheets = (after as { sheets: Array<{ name: string }> }).sheets;
    assert.ok(sheets.some((s) => s.name === 'Structure only'), 'the renamed sheet is still there');
    assert.deepEqual(sheets.length, (kept as { sheets: unknown[] }).sheets.length, 'no sheet was laid out again');
  });
});
