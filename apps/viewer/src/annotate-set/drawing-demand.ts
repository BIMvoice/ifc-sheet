/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The generated drawing of a view that is not on screen (#333). A view's
 * drawing is made by its `ViewDrawingHost`, in the generation worker, and kept
 * in `view-drawings` while the host is mounted: for a tab that is open, and for
 * a view placed on a sheet that is near the screen. The batch that annotates the
 * set asks for the drawings it needs here; `DocumentWorkspace` mounts a host
 * for each view asked for, exactly as it does for a view on a sheet, so the
 * drawing is the one the view would show (same plane, same display options,
 * same phases, same worker pool), not a second pipeline.
 */

import { create } from 'zustand';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { DrawingResult as EngineDrawingResult } from '@bimvoice/ifcsheet';
import { useViewDrawings } from '@/project/view-drawings';

/** Views whose drawing the batch is waiting for, with how many askers each has. */
export const useDrawingDemand = create<{ counts: Record<string, number> }>()(() => ({ counts: {} }));

/** Ask for the drawing of these views; the returned function gives the ask back. */
export function demandDrawings(viewIds: readonly string[]): () => void {
  const ids = [...new Set(viewIds)];
  useDrawingDemand.setState((s) => {
    const counts = { ...s.counts };
    for (const id of ids) counts[id] = (counts[id] ?? 0) + 1;
    return { counts };
  });
  let given = false;
  return () => {
    if (given) return;
    given = true;
    useDrawingDemand.setState((s) => {
      const counts = { ...s.counts };
      for (const id of ids) {
        if ((counts[id] ?? 0) > 1) counts[id] -= 1;
        else delete counts[id];
      }
      return { counts };
    });
  };
}

/** How the wait for a drawing ended: the engine's own result, `timedOutMs` set when the drawing did not come in time. */
export type DrawingResult = EngineDrawingResult<Drawing2D>;

/**
 * The drawing is not coming: no host made it in this long, so the view is skipped and named in the summary instead of
 * holding up the rest of the set (#869). Measured from asked to ready with every view of the set generating at once:
 * the slowest view took 10 s on the demo project, 21 s on the school building (ISSUE_068 skolebygg, 56 MB) and 7 s on
 * the largest fixture (342 MB, 25 views); two minutes leaves room for a machine several times slower.
 */
export const DRAWING_WAIT_MS = 2 * 60_000;

/**
 * The drawing of `viewId` once its host has made it: at once if it is there. A generation that fails, a view that
 * cannot resolve, or no host within `waitMs` ends the wait with the reason; `signal` (Stop) ends it at once.
 */
export function waitForDrawing(viewId: string, { waitMs = DRAWING_WAIT_MS, signal }: { waitMs?: number; signal?: AbortSignal } = {}): Promise<DrawingResult> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe = () => {};
    const stopped = () => settle({ drawing: null, error: 'stopped' });
    const settle = (result: DrawingResult) => {
      if (timer) clearTimeout(timer);
      unsubscribe();
      signal?.removeEventListener('abort', stopped);
      resolve(result);
    };
    if (signal?.aborted) { stopped(); return; }
    const look = (): boolean => {
      const entry = useViewDrawings.getState().byView[viewId];
      if (entry?.status === 'ready' && entry.drawing) settle({ drawing: entry.drawing });
      else if (entry?.status === 'error') settle({ drawing: null, error: entry.error ?? 'error' });
      else return false;
      return true;
    };
    if (look()) return;
    unsubscribe = useViewDrawings.subscribe(() => { look(); });
    signal?.addEventListener('abort', stopped, { once: true });
    timer = setTimeout(() => settle({ drawing: null, error: 'timeout', timedOutMs: waitMs }), waitMs);
  });
}
