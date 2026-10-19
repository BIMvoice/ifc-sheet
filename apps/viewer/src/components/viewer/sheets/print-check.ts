/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the print preview checks on a sheet, as pure geometry in paper
 * millimetres: a 1 m reference bar per viewport (at that viewport's scale)
 * and the items that leave the drawing area. Nothing here touches the sheet's
 * SVG; the preview draws these on top of it.
 */

import { entityBounds } from '@/drafting/annotation';
import type { DraftEntity } from '@/drafting/types';
import { drawingArea } from '@/project/drawing-set';
import { FRAME_MARGIN_MM, TITLE_BLOCK_MM } from '@/project/sheets';
import type { PaperSize, SheetViewport } from '@/project/types';

export interface Rect { x: number; y: number; w: number; h: number }

/** An item on the sheet: its name for the list, and the box it takes on the paper. */
export interface SheetItem {
  id: string;
  kind: 'viewport' | 'draft';
  /** Names it in the warning list (a drawing's name, a draft's kind). */
  name: string;
  box: Rect;
}

/** Why an item is flagged: it crosses the frame, overlaps the title block, or is otherwise outside the drawing area. */
export type FitReason = 'frame' | 'titleBlock' | 'area';

export interface FitProblem { item: SheetItem; reason: FitReason }

export interface ReferenceBar {
  viewportId: string;
  scale: number;
  /** Left end and baseline, paper mm. */
  x: number;
  y: number;
  /** What 1 m measures on the paper at this scale, mm. */
  lengthMm: number;
}

/** The paper's frame (inside the margin) and its title block, mm. */
export function sheetRegions(paper: PaperSize, orientation: 'landscape' | 'portrait', size: { w: number; h: number }): { area: Rect; frame: Rect; titleBlock: Rect } {
  return {
    area: drawingArea(paper, orientation),
    frame: { x: FRAME_MARGIN_MM, y: FRAME_MARGIN_MM, w: size.w - FRAME_MARGIN_MM * 2, h: size.h - FRAME_MARGIN_MM * 2 },
    titleBlock: { x: size.w - FRAME_MARGIN_MM - TITLE_BLOCK_MM.w, y: size.h - FRAME_MARGIN_MM - TITLE_BLOCK_MM.h, w: TITLE_BLOCK_MM.w, h: TITLE_BLOCK_MM.h },
  };
}

const EPS = 1e-6;
const inside = (inner: Rect, outer: Rect): boolean =>
  inner.x >= outer.x - EPS && inner.y >= outer.y - EPS && inner.x + inner.w <= outer.x + outer.w + EPS && inner.y + inner.h <= outer.y + outer.h + EPS;
const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS;

/** The items not wholly inside the drawing area, each with the most telling reason. */
export function fitProblems(items: readonly SheetItem[], regions: { area: Rect; frame: Rect; titleBlock: Rect }): FitProblem[] {
  const out: FitProblem[] = [];
  for (const item of items) {
    if (inside(item.box, regions.area)) continue;
    const reason: FitReason = !inside(item.box, regions.frame) ? 'frame' : overlaps(item.box, regions.titleBlock) ? 'titleBlock' : 'area';
    out.push({ item, reason });
  }
  return out;
}

/** Room kept above a viewport's box for its bar, mm. */
const BAR_GAP_MM = 5;

/** One bar per viewport: 1 m at the viewport's scale (1:100 is 10 mm), sitting above the viewport's box at its left. */
export function referenceBars(viewports: readonly { id: string; scale: number; box: Rect }[]): ReferenceBar[] {
  return viewports.map((v) => ({ viewportId: v.id, scale: v.scale, x: v.box.x, y: v.box.y - BAR_GAP_MM, lengthMm: 1000 / v.scale }));
}

/** A draft drawn on the paper itself (paper mm) as an item. */
export function draftItem(draft: DraftEntity): SheetItem {
  const b = entityBounds(draft.shape);
  return { id: draft.id, kind: 'draft', name: draft.shape.type, box: { x: b.min.x, y: b.min.y, w: b.max.x - b.min.x, h: b.max.y - b.min.y } };
}

/** A viewport's box on the paper (it is centred on the viewport's point). */
export function viewportRect(vp: Pick<SheetViewport, 'x' | 'y'>, box: { width: number; height: number }): Rect {
  return { x: vp.x - box.width / 2, y: vp.y - box.height / 2, w: box.width, h: box.height };
}
