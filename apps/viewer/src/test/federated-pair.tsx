/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The hand-written federated pair (`fixtures/federated/arch.ifc` + `str.ifc`,
 * #96) loaded the way the viewer federates two models: each file parsed and
 * meshed by the real engines, the second re-homed onto the federation's global
 * id space (`FederationRegistry` offset, `applyFederationOffsetToMesh`), both
 * put in the store, the RTC frames converged (`convergeFederationRtcFrame`,
 * which every federated load runs when it settles), and the project synced.
 *
 * `drawView` then draws a project view exactly as a tab does: the federated
 * mesh set from `useFederatedGeometry` published as the drawing runtime, and
 * the real `ViewDrawingHost`, so the plane, display options and generator are
 * the production ones. Callers skip when the wasm runtime is not built.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useEffect } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IfcParser, type IfcDataStore } from '@ifc-lite/parser';
import { GeometryProcessor, type GeometryResult } from '@ifc-lite/geometry';
import { FederationRegistry } from '@ifc-lite/renderer';
import { initSync } from '@ifc-lite/wasm';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { useViewerStore, type FederatedModel } from '@/store';
import { applyFederationOffsetToMesh } from '@/hooks/ingest/federationOffset';
import { convergeFederationRtcFrame } from '@/hooks/ingest/federationRtcRebase';
import { useFederatedGeometry } from '@/components/viewer/useFederatedGeometry';
import { modelIndices } from '@/lib/model-placement/model-indices';
import { publishDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { ViewDrawingHost } from '@/components/viewer/project/ViewDrawingHost';
import { useViewDrawings } from '@/project/view-drawings';
import { modelLevels } from '@/project/model-levels';
import { modelRef } from '@/project/project-sync';
import { resetProject, syncProjectWithModels, useProjectStore } from '@/project/project-store';
import type { ProjectView } from '@/project/types';

const HERE = dirname(fileURLToPath(import.meta.url));
const WASM = join(HERE, '..', '..', '..', '..', 'packages', 'wasm', 'pkg', 'ifc-lite_bg.wasm');
const FIXTURES = join(HERE, 'fixtures', 'federated');

export const WASM_BUILT = existsSync(WASM);

/** Express ids in each file (local; `str` ids are offset once federated). */
export const ARCH = { wallA: 48, wallB: 57, wallC: 64, door: 79 } as const;
export const STR = { column: 50, slab: 69 } as const;

export interface LoadedPair {
  arch: FederatedModel;
  str: FederatedModel;
  /** Global id of a structure element. */
  strId: (localId: number) => number;
}

interface Parsed { store: IfcDataStore; geometry: GeometryResult }

async function parse(file: string, processor: GeometryProcessor): Promise<Parsed> {
  const bytes = readFileSync(join(FIXTURES, file));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const store = await new IfcParser().parseColumnar(buffer, { disableWorkerScan: true });
  const geometry = await processor.process(new Uint8Array(bytes));
  return { store, geometry };
}

function federated(id: string, name: string, parsed: Parsed, idOffset: number): FederatedModel {
  // @raw-entity-enumeration-ok test fixture sizes a freshly parsed source before any mutation view exists
  const maxExpressId = Math.max(...parsed.store.entityIndex.byId.keys());
  for (const mesh of parsed.geometry.meshes) applyFederationOffsetToMesh(mesh, idOffset);
  return {
    id, name, ifcDataStore: parsed.store, geometryResult: parsed.geometry, visible: true, collapsed: false,
    schemaVersion: 'IFC4', loadedAt: idOffset, fileSize: 0, idOffset, maxExpressId, loadState: 'complete',
  } as unknown as FederatedModel;
}

/**
 * Load the pair into the store and the project. `converge: false` skips the
 * RTC convergence, leaving each model in the frame it was meshed in: the
 * negative control that shows the fixture can tell a frame bug apart.
 */
export async function loadFederatedPair(options: { converge?: boolean } = {}): Promise<LoadedPair> {
  initSync({ module: readFileSync(WASM) });
  const processor = new GeometryProcessor();
  let archParsed: Parsed, strParsed: Parsed;
  try {
    await processor.init();
    archParsed = await parse('arch.ifc', processor);
    strParsed = await parse('str.ifc', processor);
  } finally {
    processor.dispose();
  }
  const registry = new FederationRegistry();
  // @raw-entity-enumeration-ok test fixture sizes freshly parsed sources
  const archOffset = registry.registerModel('arch', Math.max(...archParsed.store.entityIndex.byId.keys()));
  // @raw-entity-enumeration-ok test fixture sizes freshly parsed sources
  const strOffset = registry.registerModel('str', Math.max(...strParsed.store.entityIndex.byId.keys()));
  const arch = federated('arch', 'arch.ifc', archParsed, archOffset);
  const str = federated('str', 'str.ifc', strParsed, strOffset);
  useViewerStore.setState({ models: new Map([['arch', arch], ['str', str]]), activeModelId: 'arch', geometryResult: null, ifcDataStore: null });
  if (options.converge !== false) convergeFederationRtcFrame();
  resetProject();
  syncProjectWithModels([modelRef(arch), modelRef(str)], [...modelLevels('arch'), ...modelLevels('str')]);
  return { arch, str, strId: (localId) => localId + strOffset };
}

function Runtime(): null {
  const models = useViewerStore((s) => s.models);
  const geometryResult = useFederatedGeometry(models, null, modelIndices(models), 0);
  useEffect(() => {
    publishDrawingRuntime({ geometryResult, sourceCoordinateInfo: geometryResult?.coordinateInfo, generateDrawing: async () => {}, isRegenerating: false });
  }, [geometryResult]);
  return null;
}

/** Draw `view` through the real `ViewDrawingHost` and return its drawing once ready. */
export async function drawView(view: Exclude<ProjectView, { kind: '3d' }>): Promise<Drawing2D> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root | null = null;
  try {
    await act(async () => {
      root = createRoot(container);
      root.render(<><Runtime /><ViewDrawingHost view={view} /></>);
    });
    for (let i = 0; i < 400; i++) {
      const entry = useViewDrawings.getState().byView[view.id];
      if (entry?.status === 'ready' && entry.drawing) return entry.drawing;
      if (entry?.status === 'error') throw new Error(`view ${view.name} failed: ${entry.error}`);
      await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
    }
    throw new Error(`view ${view.name} never became ready`);
  } finally {
    await act(async () => { root?.unmount(); });
    container.remove();
    publishDrawingRuntime(null);
  }
}

/** The project's plan view of the level named `name`. */
export function planOf(name: string): Extract<ProjectView, { kind: 'plan' }> {
  const view = useProjectStore.getState().views.find((v): v is Extract<ProjectView, { kind: 'plan' }> => v.kind === 'plan' && v.level.name === name);
  if (!view) throw new Error(`no plan for ${name}: ${useProjectStore.getState().views.map((v) => v.name).join(', ')}`);
  return view;
}
