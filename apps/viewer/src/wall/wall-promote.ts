/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Which sheets on the Wall hang with their drawing (`useWallView().drawn`). Zooming in takes many sheets over the width at
 * which they are drawn at once, and mounting a drawing is the most expensive thing the Wall does (its pens, its marks, its
 * SVG): done for all of them in one frame it is one long task. So a sheet is let in a few at a time, nearest the middle of the
 * screen first, on idle time, and not at all while a wheel or pinch is still zooming (the sheets keep hanging as outlines
 * until it has settled). A sheet that stops being near or wide enough is let go at once, which is cheap.
 */

import { sameIds } from './wall-geometry';
import { useWallView } from './wall-view';
import { MIN_DRAWN_PX } from './wall-zoom';

/** Sheets let in per step: a step is one render of this many drawings. */
export const PROMOTE_BATCH = 2;
/** How long after the last wheel or pinch event the zoom counts as settled, ms. */
export const GESTURE_QUIET_MS = 150;

let gestureUntil = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let cancelIdle: (() => void) | null = null;

/** A wheel or pinch zoomed the Wall: no sheet is let in until `GESTURE_QUIET_MS` after the last one. */
export function noteZoomGesture(): void {
  gestureUntil = Date.now() + GESTURE_QUIET_MS;
}

const whenIdle = (fn: () => void): (() => void) => {
  if (typeof requestIdleCallback === 'function') {
    const h = requestIdleCallback(fn, { timeout: 200 });
    return () => cancelIdleCallback(h);
  }
  const h = setTimeout(fn, 16);
  return () => clearTimeout(h);
};

function cancelPending(): void {
  clearTimeout(timer);
  cancelIdle?.();
  cancelIdle = null;
}

/** Bring `drawn` in line with the layout: let go of what no longer qualifies, let in the next few that do. */
export function reconcileDrawn(): void {
  cancelPending();
  const { layout, near, drawn } = useWallView.getState();
  const widths = new Map((layout?.sheets ?? []).map((s) => [s.id, s.rect.w]));
  const want = near.filter((id) => (widths.get(id) ?? 0) >= MIN_DRAWN_PX);
  const wanted = new Set(want);
  const keep = drawn.filter((id) => wanted.has(id));
  const kept = new Set(keep);
  const missing = want.filter((id) => !kept.has(id));
  const wait = gestureUntil - Date.now();
  const letIn = wait > 0 ? [] : missing.slice(0, PROMOTE_BATCH);
  const next = [...keep, ...letIn];
  if (!sameIds(next, drawn)) useWallView.setState({ drawn: next });
  if (missing.length > letIn.length) {
    if (wait > 0) timer = setTimeout(reconcileDrawn, wait);
    else cancelIdle = whenIdle(reconcileDrawn);
  }
}

/** Follow the Wall's layout for as long as the Wall is up; returns the unfollowing. */
export function startWallPromotion(): () => void {
  const stop = useWallView.subscribe((s, prev) => {
    if (s.layout !== prev.layout || s.near !== prev.near) reconcileDrawn();
  });
  reconcileDrawn();
  return () => {
    stop();
    cancelPending();
  };
}
