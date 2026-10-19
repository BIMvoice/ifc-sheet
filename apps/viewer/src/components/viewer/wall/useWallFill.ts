/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Once the sheets near the screen are drawn, the rest of the set is drawn in the
 * background, nearest first, one sheet at a time, on idle time and only while the
 * Wall holds still. It feeds the same queue as scrolling does, so every placed
 * view ends up drawn (the missing-things check reads those drawings), without
 * holding up the first paint.
 */

import { useEffect } from 'react';
import { useProjectStore } from '@/project/project-store';
import { useViewDrawings } from '@/project/view-drawings';
import { fillNext, pendingViews, useWallView, wallMovedAgo } from '@/wall/wall-view';

const STILL_MS = 300;
const POLL_MS = 150;
/** A view that has not finished in this long (one that cannot resolve never will) is not waited for. */
const STALL_MS = 8000;

const whenIdle = (fn: () => void): (() => void) => {
  if (typeof requestIdleCallback === 'function') {
    const h = requestIdleCallback(fn, { timeout: 1000 });
    return () => cancelIdleCallback(h);
  }
  const h = setTimeout(fn, 50);
  return () => clearTimeout(h);
};

/** `sheetIds` changing (a sheet added) starts the fill again. */
export function useWallFill(sheetIds: string): void {
  useEffect(() => {
    let cancel: () => void = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stalledSince = 0;
    let stalledOn = '';
    const later = (ms: number) => {
      timer = setTimeout(() => {
        cancel = whenIdle(step);
      }, ms);
    };
    const step = () => {
      if (wallMovedAgo() < STILL_MS) return later(STILL_MS);
      const { sheets, views } = useProjectStore.getState();
      const pending = pendingViews(useWallView.getState().queue, sheets, views, useViewDrawings.getState().byView);
      const key = pending.join(',');
      if (key !== stalledOn) {
        stalledOn = key;
        stalledSince = Date.now();
      }
      if (pending.length > 0 && Date.now() - stalledSince < STALL_MS) return later(POLL_MS);
      if (fillNext() === null) return;
      later(0);
    };
    later(POLL_MS);
    return () => {
      clearTimeout(timer);
      cancel();
    };
  }, [sheetIds]);
}
