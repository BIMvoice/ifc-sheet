/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useEffect, useRef } from 'react';
import { isViewportCovered, onViewportCoverChange } from './viewport-cover';

/**
 * Camera fit scheduling (#154). The first fit scans every vertex for robust bounds (about 19 ms on a 840k-triangle
 * model). While the viewport is covered nobody can see an unfitted camera, so the fit runs in a task of its own; the
 * moment the cover lifts it runs at once, before any frame can draw, and an uncovered viewport fits in the effect
 * itself as it always did. A later `scheduleCameraFit` replaces a pending one.
 */
export function useDeferredCameraFit(): {
  scheduleCameraFit: (run: () => void) => void;
  flushPendingFit: () => void;
  cancelPendingFit: () => void;
} {
  const pendingFitRef = useRef<{ run: () => void; timer: ReturnType<typeof globalThis.setTimeout> } | null>(null);
  const cancelPendingFit = () => {
    const pending = pendingFitRef.current;
    if (!pending) return;
    globalThis.clearTimeout(pending.timer);
    pendingFitRef.current = null;
  };
  const flushPendingFit = () => {
    const pending = pendingFitRef.current;
    if (!pending) return;
    cancelPendingFit();
    pending.run();
  };
  const scheduleCameraFit = (run: () => void) => {
    cancelPendingFit();
    if (!isViewportCovered()) {
      run();
      return;
    }
    pendingFitRef.current = { run, timer: globalThis.setTimeout(flushPendingFit, 0) };
  };
  useEffect(() => {
    const stopWatching = onViewportCoverChange(() => { if (!isViewportCovered()) flushPendingFit(); });
    return () => {
      stopWatching();
      cancelPendingFit();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { scheduleCameraFit, flushPendingFit, cancelPendingFit };
}
