/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The paper box of each viewport of a sheet as the sheet draws it, offered to
 * code that has no React state of its own (the legend placement, #267).
 * `useSheetContent` measures a viewport on the drafts the sheet draws, the
 * cross-references included (`crossRefInput`); while a sheet is open it
 * registers that measure here, so what places a legend beside a drawing reads
 * the same box the sheet frames, not a second measurement of the view's own drafts.
 */

import type { SheetViewport } from './types';

export type ViewportBoxOf = (vp: SheetViewport) => { width: number; height: number };

const mounted = new Map<string, ViewportBoxOf>();

/** Offer `boxOf` as the measure of sheet `sheetId`; the returned function withdraws it (only if it is still the one on offer). */
export function registerViewportBoxes(sheetId: string, boxOf: ViewportBoxOf): () => void {
  mounted.set(sheetId, boxOf);
  return () => {
    if (mounted.get(sheetId) === boxOf) mounted.delete(sheetId);
  };
}

/** The measure of the open sheet `sheetId`, or undefined while no view of it is mounted. */
export function mountedViewportBoxes(sheetId: string): ViewportBoxOf | undefined {
  return mounted.get(sheetId);
}
