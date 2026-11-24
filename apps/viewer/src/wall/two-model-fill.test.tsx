/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * #863: with two models open, the drawing set's sheets never finished loading and the screen stopped answering. Two models are
 * federated the way the viewer does it (`loadFederated`), the starting set is laid out, and the overview is run as the app runs
 * it: the background fill (`startWallFill`) queues the sheets, `DocumentWorkspace` mounts a generator for every view they place,
 * and each queued sheet hangs as a `WallSheet`, which styles its plans on the main thread (`useSheetContent`, `planOverlays`).
 *
 * The second model is the hand-written structure half of the federated pair with what a structural export carries in bulk:
 * element assemblies and property sets on them. Each plan looked for road corridors (`corridorOverlays`), and finding them
 * read every property relation once per assembly: 76 assemblies and 5,440 relations of a real structural model took 3.5 s,
 * on each plan of the set, on the main thread. Here 400 assemblies and 4,000 relations: the fill must finish every sheet,
 * with no view still generating, within {@link BOUND_MS}.
 */

import '@/test/setup-dom.js';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useViewerStore } from '@/store';
import { loadFederated, WASM_BUILT } from '@/test/federated-pair';
import { useFederatedGeometry } from '@/components/viewer/useFederatedGeometry';
import { DocumentWorkspace } from '@/components/viewer/project/DocumentWorkspace';
import { WallSheet } from '@/components/viewer/wall/WallSheet';
import { modelIndices } from '@/lib/model-placement/model-indices';
import { publishDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { setExtent } from '@/draft-set/body';
import { startDrawingSet } from '@/project/drawing-set-actions';
import { useProjectStore } from '@/project/project-store';
import { useViewDrawings } from '@/project/view-drawings';
import { startWallFill, stopWallFill } from './wall-fill';
import { pendingViews, resetWallView, useWallView } from './wall-view';

const FEDERATED = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures', 'federated');
const skip = WASM_BUILT ? false : 'wasm runtime not built (pnpm build:wasm or pnpm build:wasm:fetch)';

/** How long the whole overview may take: generous for a slow CI runner, a fraction of what one plan's corridor search took. */
const BOUND_MS = 15_000;
const ASSEMBLIES = 400;
const RELATIONS = 4_000;

/** `str.ifc` with `ASSEMBLIES` element assemblies and `RELATIONS` property sets defined on them, as a structural export has. */
function structureWithAssemblies(): Uint8Array {
  const text = readFileSync(join(FEDERATED, 'str.ifc'), 'utf8');
  const guid = (kind: string, n: number) => `'${(kind + String(n).padStart(22, '0')).slice(-22)}'`;
  const lines: string[] = [];
  let id = 1000;
  const assemblies: number[] = [];
  for (let i = 0; i < ASSEMBLIES; i++) {
    assemblies.push(++id);
    lines.push(`#${id}=IFCELEMENTASSEMBLY(${guid('Asm', i)},$,'Assembly ${i}',$,$,$,$,$,.NOTDEFINED.,.NOTDEFINED.);`);
  }
  for (let i = 0; i < RELATIONS; i++) {
    const value = ++id, set = ++id, rel = ++id;
    lines.push(`#${value}=IFCPROPERTYSINGLEVALUE('Mark',$,IFCLABEL('M${i}'),$);`);
    lines.push(`#${set}=IFCPROPERTYSET(${guid('Pset', i)},$,'Pset_Structural',$,(#${value}));`);
    lines.push(`#${rel}=IFCRELDEFINESBYPROPERTIES(${guid('Rel', i)},$,$,$,(#${assemblies[i % ASSEMBLIES]}),#${set});`);
  }
  const at = text.lastIndexOf('ENDSEC;');
  return new TextEncoder().encode(`${text.slice(0, at)}${lines.join('\n')}\n${text.slice(at)}`);
}

/** The federated mesh set published as the drawing runtime, as `DrawingRuntimeHost` publishes it. */
function Runtime(): null {
  const models = useViewerStore((s) => s.models);
  const geometryResult = useFederatedGeometry(models, null, modelIndices(models), 0);
  useEffect(() => {
    publishDrawingRuntime({ geometryResult, sourceCoordinateInfo: geometryResult?.coordinateInfo, generateDrawing: async () => {}, isRegenerating: false });
  }, [geometryResult]);
  return null;
}

/** The queued sheets hung with their drawings, as the Wall hangs the sheets near the screen. */
function QueuedSheets(): React.ReactElement {
  const queue = useWallView((s) => s.queue);
  const sheets = useProjectStore((s) => s.sheets);
  return <>{sheets.filter((s) => queue.includes(s.id)).map((s) => <WallSheet key={s.id} sheet={s} width={400} />)}</>;
}

describe('the overview of two models finishes every sheet (#863)', { skip }, () => {
  let root: Root | null = null;
  after(async () => {
    stopWallFill();
    await act(async () => { root?.unmount(); });
    publishDrawingRuntime(null);
  });

  it(`draws every sheet of an architecture and a structure with ${ASSEMBLIES} assemblies within ${BOUND_MS / 1000} s`, async () => {
    await loadFederated([
      { id: 'arch', name: 'arch.ifc', bytes: new Uint8Array(readFileSync(join(FEDERATED, 'arch.ifc'))) },
      { id: 'str', name: 'str.ifc', bytes: structureWithAssemblies() },
    ]);
    const { models, geometryResult } = useViewerStore.getState();
    assert.equal(models.size, 2, 'two models are open');
    const meshes = [...models.values()].flatMap((m) => m.geometryResult?.meshes ?? []);
    const extent = setExtent(useProjectStore.getState().levels, meshes, mergedSectionBounds(models, geometryResult)).extent;
    resetWallView();
    assert.ok(extent && startDrawingSet(meshes, extent), 'the starting set is laid out');
    const plans = useProjectStore.getState().views.filter((v) => v.kind === 'plan');
    assert.ok(plans.length >= 2, `the set has plans to style (${plans.length})`);

    const started = Date.now();
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      root = createRoot(container);
      root.render(<><Runtime /><DocumentWorkspace>{null}</DocumentWorkspace><QueuedSheets /></>);
    });
    startWallFill();
    let pending: string[] = [];
    let queued = 0;
    const { sheets } = useProjectStore.getState();
    while (Date.now() - started < BOUND_MS) {
      await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
      const s = useProjectStore.getState();
      queued = useWallView.getState().queue.length;
      pending = pendingViews(useWallView.getState().queue, s.sheets, s.views, useViewDrawings.getState().byView);
      if (queued === s.sheets.length && pending.length === 0) break;
    }
    const took = Date.now() - started;
    assert.equal(queued, sheets.length, `every sheet is queued (${queued} of ${sheets.length} after ${took} ms)`);
    assert.deepEqual(pending, [], `no view is still generating after ${took} ms`);
    const statuses = Object.values(useViewDrawings.getState().byView).map((e) => e.status);
    assert.ok(statuses.every((status) => status === 'ready'), `every view is drawn: ${statuses.join(', ')}`);
    assert.ok(took < BOUND_MS, `the overview took ${took} ms, more than ${BOUND_MS} ms`);
  });
});
