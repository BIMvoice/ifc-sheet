/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One axonometric's own generator, the sibling of `ViewDrawingHost` for a 3D
 * view that prints as vector lines. It draws the visible building along the
 * view's direction, cut away at its storey and box when it is a cut-away
 * (`project/axonometric.ts`), and keeps the result in `view-drawings.ts`,
 * where a sheet's viewport reads it like any other view's. The drawing is
 * made in the generation worker (#154) when the meshes it draws are the
 * model's own; otherwise (an instanced occurrence expanded for the drawing)
 * here.
 *
 * Like a Revit view it is independent of the 3D view's hide / isolate state:
 * only the class-level visibility toggles apply (`isTypeVisible`).
 */

import { useEffect } from 'react';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { MeshData } from '@ifc-lite/geometry';
import { gatherDrawnMeshes } from '@/lib/export/view-pdf/view-pdf-export-source';
import { useDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { generateDrawing } from '@/lib/drawing/generation/client';
import { axonometricJob, runGenerateJob, type ProgressFn } from '@/lib/drawing/generation/generate-job';
import { isTypeVisible } from '@/store/typeVisibilityFilter';
import { useViewerStore } from '@/store';
import { useProjectStore } from '@/project/project-store';
import { drawingAsViewShows } from '@/project/view-appearance';
import { dropViewDrawing, patchViewDrawing } from '@/project/view-drawings';
import type { ProjectLevel, ThreeDProjectView } from '@/project/types';

/** The axonometric of `meshes`, off the main thread when they are all among `all` (what the worker holds), else here. */
function drawOffThread(all: readonly MeshData[] | undefined, meshes: MeshData[], view: ThreeDProjectView, levels: readonly ProjectLevel[], onProgress: ProgressFn): Promise<Drawing2D> {
  const job = axonometricJob(view, levels);
  const held = all ? new Set(all) : null;
  if (held && meshes.every((m) => held.has(m))) return generateDrawing({ allMeshes: all!, meshes, ...job, onProgress }, undefined);
  return runGenerateJob({ meshes, ...job }, undefined, onProgress);
}

export function AxonometricDrawingHost({ view }: { view: ThreeDProjectView }): null {
  const { geometryResult } = useDrawingRuntime();
  const models = useViewerStore((s) => s.models);
  const typeVisibility = useViewerStore((s) => s.typeVisibility);
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  const levels = useProjectStore((s) => s.levels);
  const viewId = view.id;
  // What the drawing is a function of; a rename or a sheet move must not regenerate it. A cut-away's storey cut also follows the loaded level's floor.
  const key = JSON.stringify([
    view.preset, view.viewpoint && [view.viewpoint.position, view.viewpoint.target, view.viewpoint.up], view.projection, view.shaded, view.scale, view.showHidden,
    view.cutaway, view.cutaway?.storey ? levels.map((l) => [l.elevation, l.floorY]) : null,
  ]);

  useEffect(() => {
    let current = true;
    const meshes = gatherDrawnMeshes(useViewerStore.getState()).filter((m) => isTypeVisible(m.ifcType, typeVisibility));
    if (meshes.length === 0) {
      patchViewDrawing(viewId, { drawing: null, status: 'idle', error: null });
      return;
    }
    patchViewDrawing(viewId, { status: 'generating', progress: 0, error: null });
    drawOffThread(geometryResult?.meshes, meshes, view, levels, (phase, progress) => { if (current) patchViewDrawing(viewId, { progress: progress * 100, phase }); })
      .then((drawing) => { if (current) patchViewDrawing(viewId, { drawing: drawingAsViewShows(drawing, view), status: 'ready', error: null }); })
      .catch((error: unknown) => { if (current) patchViewDrawing(viewId, { status: 'error', error: error instanceof Error ? error.message : String(error) }); });
    return () => { current = false; };
    // `view` and `levels` are read through `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewId, key, geometryResult, models, typeVisibility, mutationVersion]);
  useEffect(() => () => dropViewDrawing(viewId), [viewId]);
  return null;
}
