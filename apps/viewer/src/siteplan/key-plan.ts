/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A key plan: a small plan of the whole building on a sheet, with the part a
 * given viewport shows outlined. It is a viewport like any other (same view,
 * whole drawing, small scale) that names the viewport it keys
 * (`SheetViewport.keyPlanOf`). Both show the same plan, so they share its
 * drawing frame; the outline is the keyed viewport's box taken back to
 * drawing metres through its transform and forward to paper through the key
 * plan's.
 */

import { drawingToScreen, screenToDrawing, type SectionAxisName, type ViewTransform } from '@/drafting/frame';
import { SHEET_SCALES, paperOf } from '@/project/sheets';
import { frameOf, titleBlockRect } from '@/project/sheet-frame';
import type { ProjectSheet } from '@/project/types';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Extent {
  min: { x: number; y: number };
  max: { x: number; y: number };
}

/** The drawing extent (metres) a viewport box on the paper shows, through its transform. */
export function viewportExtent(box: Rect, t: ViewTransform, axis: SectionAxisName): Extent {
  const a = screenToDrawing({ x: box.x, y: box.y }, t, axis);
  const b = screenToDrawing({ x: box.x + box.width, y: box.y + box.height }, t, axis);
  return { min: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }, max: { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) } };
}

/** That extent on the key plan's paper, through the key plan's transform. */
export function keyPlanHighlight(extent: Extent, keyTransform: ViewTransform, axis: SectionAxisName): Rect {
  const a = drawingToScreen(extent.min, keyTransform, axis);
  const b = drawingToScreen(extent.max, keyTransform, axis);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

/** The paper a key plan may take, mm. */
export const KEY_PLAN_MM = { w: 90, h: 60 } as const;

/** The smallest scale on the list (largest drawing) at which `bounds` fits the key plan's paper. */
export function keyPlanScale(bounds: Extent | null): number {
  if (!bounds) return 500;
  const w = bounds.max.x - bounds.min.x;
  const h = bounds.max.y - bounds.min.y;
  return SHEET_SCALES.find((s) => (w * 1000) / s <= KEY_PLAN_MM.w - 10 && (h * 1000) / s <= KEY_PLAN_MM.h - 10) ?? SHEET_SCALES[SHEET_SCALES.length - 1];
}

/** Where a key plan goes on a sheet: right, just above the title block (left of it, at the bottom, when the title block is a strip down the right). */
export function keyPlanPlace(sheet: ProjectSheet): { x: number; y: number } {
  const box = titleBlockRect(paperOf(sheet), frameOf(sheet));
  if (box.h > box.w) return { x: box.x - KEY_PLAN_MM.w / 2 - 8, y: box.y + box.h - KEY_PLAN_MM.h / 2 - 2 };
  return { x: box.x + box.w - KEY_PLAN_MM.w / 2 - 2, y: box.y - KEY_PLAN_MM.h / 2 - 8 };
}
