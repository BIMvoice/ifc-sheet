/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One axonometric's own generator, the sibling of `ViewDrawingHost` for a 3D
 * view that prints as vector lines. It draws the whole visible building along
 * the view's direction (`project/axonometric.ts`) and keeps the result in
 * `view-drawings.ts`, where a sheet's viewport reads it like any other view's.
 *
 * Like a Revit view it is independent of the 3D view's hide / isolate state:
 * only the class-level visibility toggles apply (`isTypeVisible`).
 */

import { useEffect } from 'react';
import { gatherDrawnMeshes } from '@/lib/export/view-pdf/view-pdf-export-source';
import { useDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { isTypeVisible } from '@/store/typeVisibilityFilter';
import { useViewerStore } from '@/store';
import { drawAxonometric } from '@/project/axonometric';
import { dropViewDrawing, patchViewDrawing } from '@/project/view-drawings';
import type { ThreeDProjectView } from '@/project/types';

export function AxonometricDrawingHost({ view }: { view: ThreeDProjectView }): null {
  const { geometryResult } = useDrawingRuntime();
  const models = useViewerStore((s) => s.models);
  const typeVisibility = useViewerStore((s) => s.typeVisibility);
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  const viewId = view.id;
  // What the drawing is a function of; a rename or a sheet move must not regenerate it.
  const key = JSON.stringify([view.preset, view.viewpoint && [view.viewpoint.position, view.viewpoint.target, view.viewpoint.up], view.projection, view.shaded, view.scale, view.showHidden]);

  useEffect(() => {
    let current = true;
    const meshes = gatherDrawnMeshes(useViewerStore.getState()).filter((m) => isTypeVisible(m.ifcType, typeVisibility));
    if (meshes.length === 0) {
      patchViewDrawing(viewId, { drawing: null, status: 'idle', error: null });
      return;
    }
    patchViewDrawing(viewId, { status: 'generating', progress: 0, error: null });
    drawAxonometric(meshes, view, (phase, progress) => { if (current) patchViewDrawing(viewId, { progress: progress * 100, phase }); })
      .then((drawing) => { if (current) patchViewDrawing(viewId, { drawing, status: 'ready', error: null }); })
      .catch((error: unknown) => { if (current) patchViewDrawing(viewId, { status: 'error', error: error instanceof Error ? error.message : String(error) }); });
    return () => { current = false; };
    // `view` itself is read through `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewId, key, geometryResult, models, typeVisibility, mutationVersion]);
  useEffect(() => () => dropViewDrawing(viewId), [viewId]);
  return null;
}
