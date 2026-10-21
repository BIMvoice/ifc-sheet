/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Resizing a viewport by hand (#139). The box is a crop: dragging an edge
 * shows more or less of the drawing, and the drawing stays where it is on the
 * paper at the same scale. So the viewport's centre on the paper moves with
 * the edge, and the drawing point shown at that centre (`center`) moves by the
 * same amount the other way, which keeps the drawing → paper transform still.
 * Sizes are whole millimetres, never below a minimum, and never out of the
 * sheet's drawing area.
 */

import { isRasterView } from './axonometric';
import { drawingAreaIn, frameOf, type Rect } from './sheet-frame';
import { paperOf } from './sheets';
import type { ProjectSheet, ProjectView, SheetViewport } from './types';

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const RESIZE_HANDLES: readonly ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** The smallest box, paper mm: enough to still see and grab. */
export const MIN_VIEWPORT_MM = { width: 20, height: 15 } as const;

/** What a resize sets on the viewport: the box, its centre on the paper, and the drawing point shown there. */
export type ViewportFrame = Pick<SheetViewport, 'x' | 'y' | 'width' | 'height'> & { center: { x: number; y: number } };

/**
 * The sheet's drawing area, paper mm: inside its frame's margins, beside its
 * title block. The same `drawingAreaIn` the sheet SVG and the scales read, so
 * a resize cannot stop short of, or run past, the area the sheet draws.
 */
export function sheetDrawingArea(sheet: ProjectSheet): Rect {
  return drawingAreaIn(paperOf(sheet), frameOf(sheet));
}

/**
 * Whether a view's viewport has a crop to resize: a drawing that is cut to its
 * box. A detail shows exactly its area, a raster is an image of fixed size, a
 * drafting view is framed on its drafts, and a schedule, legend or road
 * drawing (no view) lays itself out.
 */
export function isResizable(view: ProjectView | undefined): boolean {
  return !!view && !view.detail && view.kind !== 'drafting' && !(view.kind === '3d' && isRasterView(view));
}

/**
 * The frame after `handle` is dragged to the paper point `to`. `box` is the box
 * the viewport shows now; `anchor` is where the drawing's origin sits on the
 * paper (the viewport's drawing → paper transform) and `signs` its axis flips,
 * so the drawing does not move; `scale` is the viewport's 1:N denominator. `min` is the smallest box (a schedule's: one band whole).
 */
export function resizedFrame(
  vp: Pick<SheetViewport, 'x' | 'y' | 'scale'>, box: { width: number; height: number }, handle: ResizeHandle, to: { x: number; y: number },
  area: Rect, anchor: { x: number; y: number }, signs: { x: number; y: number }, min: { width: number; height: number } = MIN_VIEWPORT_MM,
): ViewportFrame {
  const left = vp.x - box.width / 2;
  const right = vp.x + box.width / 2;
  const top = vp.y - box.height / 2;
  const bottom = vp.y + box.height / 2;
  const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));
  let width = box.width;
  let height = box.height;
  let x = vp.x;
  let y = vp.y;
  if (handle.includes('e')) {
    width = clamp(Math.round(to.x - left), min.width, area.x + area.w - left);
    x = left + width / 2;
  } else if (handle.includes('w')) {
    width = clamp(Math.round(right - to.x), min.width, right - area.x);
    x = right - width / 2;
  }
  if (handle.includes('s')) {
    height = clamp(Math.round(to.y - top), min.height, area.y + area.h - top);
    y = top + height / 2;
  } else if (handle.includes('n')) {
    height = clamp(Math.round(bottom - to.y), min.height, bottom - area.y);
    y = bottom - height / 2;
  }
  const mm = 1000 / vp.scale;
  // The drawing point at the new centre that leaves the drawing where it was on the paper.
  return { x, y, width, height, center: { x: (x - anchor.x) / (signs.x * mm), y: (y - anchor.y) / (signs.y * mm) } };
}
