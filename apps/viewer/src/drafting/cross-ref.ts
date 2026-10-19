/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Cross-references: which drawing number a view has on its sheet, and the one
 * place a mark resolves "the view I point at" to "3 / A-301". Section marks
 * and elevation marks both read it. Nothing here is stored: a number and a
 * sheet number are looked up from the sheets as they are now, so a mark follows a
 * drawing that moves to another sheet, is renumbered, or sits on a sheet that is
 * renumbered, without anyone editing the plan the mark is on. Pure.
 */

import type { ProjectSheet, SheetViewport } from '@/project/types';
import { sheetHolding } from './detail-mark';

type SheetLike = Pick<ProjectSheet, 'number' | 'viewports'>;

/** Viewports whose centres are this close (paper mm, vertically) read as one row. */
const ROW_MM = 20;

/**
 * The drawing number of every drawing on `sheet`, by viewport id. A viewport
 * with a number of its own keeps it; the others are numbered 1, 2, 3 … in
 * reading order (rows top to bottom, each row left to right), skipping a
 * number somebody chose. Only viewports of a view in `viewIds` count: a
 * schedule or a legend has no drawing number.
 */
export function drawingNumbers(sheet: Pick<ProjectSheet, 'viewports'>, viewIds: ReadonlySet<string>): Map<string, string> {
  const drawn = (sheet.viewports ?? []).filter((vp) => viewIds.has(vp.viewId));
  const out = new Map<string, string>();
  const chosen = (vp: SheetViewport): string => (vp.drawingNumber ?? '').trim();
  for (const vp of drawn) if (chosen(vp)) out.set(vp.id, chosen(vp));
  const taken = new Set(out.values());
  let next = 1;
  for (const vp of readingOrder(drawn)) {
    if (out.has(vp.id)) continue;
    while (taken.has(String(next))) next++;
    out.set(vp.id, String(next));
    next++;
  }
  return out;
}

/** `vps` top to bottom, and left to right within a row. */
function readingOrder(vps: readonly SheetViewport[]): SheetViewport[] {
  const byY = [...vps].sort((a, b) => a.y - b.y);
  const rows: SheetViewport[][] = [];
  let rowY = Number.NEGATIVE_INFINITY;
  for (const vp of byY) {
    if (vp.y - rowY > ROW_MM) {
      rows.push([]);
      rowY = vp.y;
    }
    rows[rows.length - 1].push(vp);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.x - b.x));
}

/** Where a view is drawn: its number on its sheet, and the sheet's number. */
export interface ViewReference {
  drawing: string;
  sheet: string;
}

/**
 * Where `viewId` is drawn, or `null` when it is on no sheet. On two sheets
 * the first in set order (the order of `sheets`) is the one named. Detail
 * marks name their sheet the same way (`sheetNumberOf`, over the same `sheetHolding`).
 */
export function viewReference(viewId: string, viewIds: ReadonlySet<string>, sheets: readonly SheetLike[]): ViewReference | null {
  const sheet = sheetHolding(viewId, sheets);
  const vp = sheet?.viewports?.find((v) => v.viewId === viewId);
  const drawing = sheet && vp ? drawingNumbers(sheet, viewIds).get(vp.id) : undefined;
  return sheet && drawing !== undefined ? { drawing, sheet: sheet.number } : null;
}

/** `1 / A-301`. */
export const referenceLabel = (r: ViewReference): string => `${r.drawing} / ${r.sheet}`;
