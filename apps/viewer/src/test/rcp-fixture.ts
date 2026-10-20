/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The reflected-ceiling-room fixture, meshed by the repo's own WASM engine (viewer frame, Y-up). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IfcAPI, initSync } from '@ifc-lite/wasm';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { GeometryResult, MeshData } from '@ifc-lite/geometry';
import { useDrawingGeneration } from '@/hooks/useDrawingGeneration';
import type { ProjectLevel, ProjectView } from '@/project/types';
import { viewDisplayOverrides } from '@/project/view-drawings';
import { sectionPlaneForView } from '@/project/view-plane';
import { applyRemeshConfig, remeshOnApi, styleWireOnApi } from '../../../../packages/geometry/src/remesh/remesh-core.js';

const WASM = new URL('../../../../packages/wasm/pkg/ifc-lite_bg.wasm', import.meta.url);
let ready = false;
const FIXTURE = new URL('../project/__fixtures__/reflected-ceiling-room.ifc', import.meta.url);

/** Level 1's elevation, the soffit and the light's height above it, and the light's footprint centre (IFC x, y), as the fixture states them. */
export const RCP_FIXTURE = { storeyZ: 3.0, ceilingHeight: 2.7, lightHeight: 2.6, light: { x: 6.0, y: 1.2 }, ceilingEdgeX: 4.0 } as const;

export interface RcpFixtureIds { wall: number[]; slab: number; ceiling: number; light: number }

/** The fixture's STEP text. */
export const rcpFixtureText = (): string => readFileSync(FIXTURE, 'utf8');

/** Meshes the fixture, or the STEP text `text` (a variant of it). */
export function meshRcpFixture(text: string = rcpFixtureText()): { meshes: MeshData[]; ids: RcpFixtureIds } {
  const bytes = new TextEncoder().encode(text);
  const idsOf = (type: string) => [...text.matchAll(new RegExp(`^#(\\d+)=${type}\\(`, 'gm'))].map((m) => Number(m[1]));
  const ids: RcpFixtureIds = { wall: idsOf('IFCWALL'), slab: idsOf('IFCSLAB')[0], ceiling: idsOf('IFCCOVERING')[0], light: idsOf('IFCLIGHTFIXTURE')[0] };
  if (!ready) { initSync({ module: readFileSync(WASM) }); ready = true; }
  const api = new IfcAPI();
  try {
    applyRemeshConfig(api, { mergeLayers: false, tessellationQuality: null, skipSmallCuts: false, rectParamFastPath: true });
    const wire = styleWireOnApi(api, bytes);
    const targets = Uint32Array.from([...ids.wall, ids.slab, ids.ceiling, ids.light]);
    const { meshes } = remeshOnApi(api, { buffer: bytes, targets, frame: { x: 0, y: 0, z: 0, needsShift: false }, ...wire });
    // The engine emits each element in its own frame (world = origin + position); the drawings take absolute positions.
    const absolute = meshes.map((m): MeshData => {
      const o = m.origin ?? [0, 0, 0];
      const positions = Float32Array.from(m.positions, (v, i) => v + o[i % 3]);
      return { ...m, positions, origin: undefined };
    });
    return { meshes: absolute, ids };
  } finally {
    api.free();
  }
}

export function rcpBounds(meshes: readonly MeshData[]): { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } {
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const m of meshes) for (let i = 0; i < m.positions.length; i += 3) {
    min.x = Math.min(min.x, m.positions[i]); max.x = Math.max(max.x, m.positions[i]);
    min.y = Math.min(min.y, m.positions[i + 1]); max.y = Math.max(max.y, m.positions[i + 1]);
    min.z = Math.min(min.z, m.positions[i + 2]); max.z = Math.max(max.z, m.positions[i + 2]);
  }
  return { min, max };
}

/** What `ViewDrawingHost` does for a view: its plane and display overrides into the real hook; the drawing it publishes. */
export async function generateRcpView(view: ProjectView): Promise<Drawing2D> {
  const { meshes } = meshed ??= meshRcpFixture();
  const bounds = rcpBounds(meshes);
  const geometry: GeometryResult = {
    meshes,
    totalTriangles: meshes.reduce((n, m) => n + m.indices.length / 3, 0),
    totalVertices: meshes.reduce((n, m) => n + m.positions.length / 3, 0),
    coordinateInfo: { originShift: { x: 0, y: 0, z: 0 }, originalBounds: bounds, shiftedBounds: bounds, hasLargeCoordinates: false },
  };
  const level: ProjectLevel = { name: 'Level 1', elevation: RCP_FIXTURE.storeyZ, storeyGlobalIds: [] };
  const resolved = sectionPlaneForView(view, bounds, [level]);
  assert.ok(resolved, `${view.id} resolves`);
  const sectionPlane = resolved;
  const { showConstructionProjection, constructionProjectionDepth } = viewDisplayOverrides(view);
  let drawing: Drawing2D | null = null;
  let run: (() => Promise<void>) | null = null;
  function Harness(): null {
    run = useDrawingGeneration({
      activeTool: 'select', geometryResult: geometry, ifcDataStore: null, sectionPlane,
      displayOptions: { showHiddenLines: true, useSymbolicRepresentations: false, show3DOverlay: false, scale: 50, showConstructionProjection, constructionProjectionDepth },
      combinedHiddenIds: new Set<number>(), combinedIsolatedIds: null, computedIsolatedIds: null,
      models: new Map([['m0', { id: 'm0', visible: true }]]), panelVisible: false,
      typeVisibility: { spaces: true, spatialZones: true, openings: true, virtualElements: true, site: true, ifcAnnotations: true },
      drawing: null, setDrawing: (d) => { drawing = d; }, setDrawingStatus: () => {}, setDrawingProgress: () => {}, setDrawingError: () => {}, primary: false,
    }).generateDrawing;
    return null;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root | null = null;
  try {
    await act(async () => { root = createRoot(container); root.render(createElement(Harness)); });
    await act(async () => { await run!(); });
    assert.ok(drawing, `${view.id} generated`);
    return drawing;
  } finally {
    if (root) await act(async () => { root!.unmount(); });
    container.remove();
  }
}

let meshed: ReturnType<typeof meshRcpFixture> | undefined;
