/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A model loaded for the urban indicators (#76): parsed with the real
 * parser, meshed with the real wasm (as the viewer's geometry pipeline does,
 * per-element origin kept), put in the viewer store, and the project's levels
 * synced from it.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TestContext } from 'node:test';
import { IfcAPI, initSync } from '@ifc-lite/wasm';
import type { GeometryResult, MeshData } from '@ifc-lite/geometry';
import { useViewerStore } from '@/store';
import { useProjectStore } from '@/project/project-store';
import { modelLevels } from '@/project/model-levels';
import { levelsFromStoreys } from '@/project/view-defaults';
import { parseStep } from './properties-panel-harness';

const wasmPath = resolve(import.meta.dirname, '../../../../packages/wasm/pkg/ifc-lite_bg.wasm');
let initialized = false;

/** Initialise the real wasm, or skip when the bundle is absent. */
export function urbanWasm(t: TestContext): boolean {
  if (!existsSync(wasmPath)) { t.skip('WASM absent: run pnpm build:wasm:fetch'); return false; }
  if (!initialized) { initSync({ module: readFileSync(wasmPath) }); initialized = true; }
  return true;
}

/** Every element mesh of `bytes`, as the viewer holds them. */
export function wasmMeshes(bytes: Uint8Array): MeshData[] {
  const api = new IfcAPI();
  const out: MeshData[] = [];
  try {
    const pre = api.buildPrePassOnce(bytes);
    const [x, y, z] = pre.rtcOffset ? Array.from(pre.rtcOffset as ArrayLike<number>) : [0, 0, 0];
    const collection = api.processGeometryBatch(bytes, pre.jobs, pre.unitScale, x, y, z, pre.needsShift, pre.voidKeys, pre.voidCounts, pre.voidValues, pre.styleIds, pre.styleColors);
    try {
      for (let i = 0; i < collection.length; i++) {
        const mesh = collection.get(i);
        if (!mesh) continue;
        try {
          const o = mesh.origin;
          out.push({
            expressId: mesh.expressId, ifcType: mesh.ifcType, positions: mesh.positions.slice(), normals: new Float32Array(0),
            indices: mesh.indices.slice(), color: [1, 1, 1, 1], origin: [o[0], o[1], o[2]],
          });
        } finally { mesh.free(); }
      }
    } finally { collection.free(); }
  } finally {
    try { api.clearPrePassCache(); } finally { api.free(); }
  }
  return out;
}

/** Load `bytes` as the only model, with these meshes, and sync the project's levels from it. */
export async function loadUrbanModel(modelId: string, bytes: Uint8Array, meshes: MeshData[] = wasmMeshes(bytes)): Promise<void> {
  const store = await parseStep(bytes);
  const geometryResult = { meshes, totalTriangles: 0, totalVertices: 0 } as unknown as GeometryResult;
  useViewerStore.setState({
    models: new Map([[modelId, { id: modelId, name: modelId, ifcDataStore: store, geometryResult, visible: true, idOffset: 0, maxExpressId: 1_000_000, loadedAt: 1 }]]) as never,
    activeModelId: modelId,
    ifcDataStore: store,
    mutationViews: new Map(),
  });
  useProjectStore.setState({ levels: levelsFromStoreys(modelLevels(modelId)) });
}
