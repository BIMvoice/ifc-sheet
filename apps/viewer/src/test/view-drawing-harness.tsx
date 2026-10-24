/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Test-only: a project view's drawing as the app makes it, from real wasm
 * meshes. It takes the steps `ViewDrawingHost` takes: the view's plane
 * (`sectionPlaneForView`), its display overrides (`viewDisplayOverrides`) over
 * the store's default display options, the real `useDrawingGeneration` hook,
 * and `drawingShownBy`. Nothing is mocked; an IFC file is meshed with the
 * engine the viewer loads.
 */

import '@/test/setup-dom.js';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { GeometryProcessor, type GeometryResult } from '@ifc-lite/geometry';
import { useDrawingGeneration } from '@/hooks/useDrawingGeneration';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { getDefaultDrawing2DState } from '@/store/slices/drawing2DSlice';
import type { TypeVisibilityGate } from '@/store/typeVisibilityFilter';
import { TYPE_VISIBILITY_SEMANTIC_DEFAULTS } from '@/store/constants';
import { sectionPlaneForView } from '@/project/view-plane';
import { viewDisplayOverrides } from '@/project/view-drawings';
import { drawingShownBy } from '@/project/view-shown';
import type { ProjectView } from '@/project/types';

const WASM = new URL('../../../../packages/wasm/pkg/ifc-lite_bg.wasm', import.meta.url);

/** Meshes of an IFC file, from the engine; `null` when the wasm runtime is not built (`pnpm build:wasm:fetch`). */
export async function meshFile(file: URL): Promise<GeometryResult | null> {
  try { await Promise.all([access(WASM), access(file)]); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return null;
  }
  const { default: init } = await import('@ifc-lite/wasm');
  await init({ module_or_path: await readFile(WASM) });
  const processor = new GeometryProcessor();
  try {
    await processor.init();
    return await processor.process(new Uint8Array(await readFile(file)));
  } finally {
    processor.dispose();
  }
}

/** The class toggles a fresh viewer starts with. */
const VIEWER_START: TypeVisibilityGate = TYPE_VISIBILITY_SEMANTIC_DEFAULTS;

/** The model bounds the views resolve against, as `ViewDrawingHost` reads them. */
export function boundsOf(geometry: GeometryResult) {
  return mergedSectionBounds(new Map(), geometry);
}

/** The drawing `view` shows (before any sheet), made the way an open view makes it. */
export async function viewDrawing(view: Exclude<ProjectView, { kind: '3d' }>, geometry: GeometryResult): Promise<Drawing2D | null> {
  const plane = sectionPlaneForView(view, boundsOf(geometry), []);
  assert.ok(plane, `view ${view.name} has no plane`);
  const { showConstructionProjection, constructionProjectionDepth } = viewDisplayOverrides(view);
  const displayOptions = { ...getDefaultDrawing2DState().drawing2DDisplayOptions, useSymbolicRepresentations: false, showConstructionProjection, constructionProjectionDepth };
  let drawing: Drawing2D | null = null;
  let run: (() => Promise<void>) | null = null;
  function Harness(): null {
    const { generateDrawing } = useDrawingGeneration({
      activeTool: 'select', geometryResult: geometry, ifcDataStore: null, sectionPlane: plane!, displayOptions,
      typeVisibility: VIEWER_START, combinedHiddenIds: new Set<number>(), combinedIsolatedIds: null, computedIsolatedIds: null,
      models: new Map([['m0', { id: 'm0', visible: true }]]), panelVisible: false, drawing: null,
      setDrawing: (d) => { drawing = d; }, setDrawingStatus: () => {}, setDrawingProgress: () => {}, setDrawingError: () => {}, primary: false,
    });
    run = generateDrawing;
    return null;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  let root: Root | null = null;
  try {
    root = createRoot(container);
    await act(async () => { root!.render(<Harness />); });
    assert.ok(run, 'the hook never rendered');
    await act(async () => { await run!(); });
  } finally {
    if (root) await act(async () => { root!.unmount(); });
    container.remove();
  }
  const generated = drawing as Drawing2D | null;
  return generated ? drawingShownBy(view, generated) : null;
}

/**
 * Whether an interior elevation is closed at both ends of its wall: a vertical
 * cut line at each end of `crop` (within 1 cm of the wall face) covering the
 * room's height from floor to top (within 1 cm).
 */
export function closedEnds(drawing: Drawing2D, crop: { min: { x: number; y: number }; max: { x: number; y: number } }): { left: boolean; right: boolean } {
  const covered = (x: number) => {
    const spans = drawing.lines
      .filter((l) => l.category === 'cut' && Math.abs(l.line.start.x - x) < 0.01 && Math.abs(l.line.end.x - x) < 0.01)
      .map((l) => [Math.min(l.line.start.y, l.line.end.y), Math.max(l.line.start.y, l.line.end.y)] as const)
      .sort((a, b) => a[0] - b[0]);
    let reach = crop.min.y + 0.01;
    for (const [lo, hi] of spans) if (lo <= reach + 0.01) reach = Math.max(reach, hi);
    return reach >= crop.max.y - 0.01;
  };
  return { left: covered(crop.min.x), right: covered(crop.max.x) };
}
