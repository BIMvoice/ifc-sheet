/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Once the sheets near the screen are drawn, the rest of the set is drawn in the
 * background, nearest first, one sheet at a time, on idle time and only while
 * nobody is moving the Wall, clicking or typing. It feeds the same queue as
 * scrolling does, so every placed view ends up drawn (the missing-things check
 * reads those drawings), without holding up the first paint.
 *
 * It lives here, not in the Wall component: stepping into a sheet takes the Wall
 * away, and the fill keeps going (in the project's sheet order while there is no
 * Wall to measure) until every sheet is queued or the project is replaced.
 */

import { useProjectStore } from '@/project/project-store';
import { useViewDrawings } from '@/project/view-drawings';
import { fillNext, noteWallMoved, pendingViews, useWallView, wallMovedAgo, wallViewGeneration } from './wall-view';

const STILL_MS = 300;
const POLL_MS = 150;
/** A view that has not finished in this long (one that cannot resolve never will) is not waited for. */
const STALL_MS = 8000;
const INTERACTIONS = ['pointerdown', 'keydown', 'wheel'] as const;

const whenIdle = (fn: () => void): (() => void) => {
  if (typeof requestIdleCallback === 'function') {
    const h = requestIdleCallback(fn, { timeout: 1000 });
    return () => cancelIdleCallback(h);
  }
  const h = setTimeout(fn, 50);
  return () => clearTimeout(h);
};

let stopRunning: (() => void) | null = null;

export function wallFillRunning(): boolean {
  return stopRunning !== null;
}

export function stopWallFill(): void {
  stopRunning?.();
  stopRunning = null;
}

/** Start the fill, or start it again (a sheet added): it runs on its own until done or the project is replaced. */
export function startWallFill(): void {
  stopWallFill();
  const generation = wallViewGeneration();
  let cancel: () => void = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stalledSince = 0;
  let stalledOn = '';
  const onInteraction = () => noteWallMoved();
  const stop = () => {
    clearTimeout(timer);
    cancel();
    if (typeof window !== 'undefined') for (const type of INTERACTIONS) window.removeEventListener(type, onInteraction, true);
    if (stopRunning === stop) stopRunning = null;
  };
  const later = (ms: number) => {
    timer = setTimeout(() => {
      cancel = whenIdle(step);
    }, ms);
  };
  const step = () => {
    // Another project: its sheets are not this run's to draw.
    if (wallViewGeneration() !== generation) return stop();
    if (wallMovedAgo() < STILL_MS) return later(STILL_MS);
    const { sheets, views } = useProjectStore.getState();
    const pending = pendingViews(useWallView.getState().queue, sheets, views, useViewDrawings.getState().byView);
    const key = pending.join(',');
    if (key !== stalledOn) {
      stalledOn = key;
      stalledSince = Date.now();
    }
    if (pending.length > 0 && Date.now() - stalledSince < STALL_MS) return later(POLL_MS);
    if (fillNext(sheets.map((s) => s.id)) === null) return stop();
    later(0);
  };
  if (typeof window !== 'undefined') for (const type of INTERACTIONS) window.addEventListener(type, onInteraction, { capture: true, passive: true });
  stopRunning = stop;
  later(POLL_MS);
}
