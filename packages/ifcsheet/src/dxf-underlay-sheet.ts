/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The DXF linework a sheet prints under a viewport (#547), as pen strokes: what the PDF and the DXF of the sheet draw. */

import type { Point2D } from '@ifc-lite/drawing-2d';
import { clipPolyline } from './clip.js';
import { DXF_UNDERLAY_PEN_MM, dxfUnderlayRuns, printedDxfUnderlays, type ViewDxfUnderlay } from './dxf-underlay.js';
import type { SheetStroke } from './sheet-stroke.js';

/**
 * One stroke per layer that is on, of each DXF underlay of `viewId` that `sheetId` prints: its runs through `at` (a drawing point to the paper)
 * and clipped to the viewport's `box`. A layer that is off has no stroke.
 */
export function dxfSheetStrokes(all: readonly ViewDxfUnderlay[] | undefined, viewId: string, sheetId: string, at: (p: Point2D) => Point2D, box: { x: number; y: number; w: number; h: number } | null): SheetStroke[] {
  const out: SheetStroke[] = [];
  for (const u of printedDxfUnderlays(all, viewId, sheetId)) {
    const byLayer = new Map<string, { colour: string; runs: Point2D[][] }>();
    for (const run of dxfUnderlayRuns(u)) {
      const paper = run.points.map(at);
      const entry = byLayer.get(run.layer) ?? { colour: run.colour, runs: [] };
      entry.runs.push(...(box ? clipPolyline(paper, box) : [paper]));
      byLayer.set(run.layer, entry);
    }
    for (const { colour, runs } of byLayer.values()) {
      if (runs.length > 0) out.push({ colour, width: DXF_UNDERLAY_PEN_MM, runs, opacity: u.opacity });
    }
  }
  return out;
}
