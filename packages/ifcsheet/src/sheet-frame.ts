/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where a sheet's frame line, title block and drawing area are on its paper,
 * mm from the top-left corner. The sheet SVG, the drawing area the scales
 * fit to and the DXF / PDF all read it from here, so they cannot disagree.
 */

import type { SheetFrame, TitleBlockPosition } from './document.js';

/** The title block's size on the paper, mm: 180 along, 50 across. */
export const TITLE_BLOCK_MM = { w: 180, h: 50 };

/** Frame margin of a sheet that names none, mm. */
export const FRAME_MARGIN_MM = 10;

/** A margin is within these bounds, mm. */
export const MARGIN_MM = { min: 0, max: 50 } as const;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const DEFAULT_FRAME: SheetFrame = {
  margins: { top: FRAME_MARGIN_MM, right: FRAME_MARGIN_MM, bottom: FRAME_MARGIN_MM, left: FRAME_MARGIN_MM },
  titleBlock: 'bottom-right',
};

export const frameOf = (sheet: { frame?: SheetFrame }): SheetFrame => sheet.frame ?? DEFAULT_FRAME;

/** The frame line: the paper inside the margins. */
export function frameRect(paper: { w: number; h: number }, frame: SheetFrame): Rect {
  const { top, right, bottom, left } = frame.margins;
  return { x: left, y: top, w: paper.w - left - right, h: paper.h - top - bottom };
}

/** The title block, in the frame's bottom-right corner: across at the bottom, or (a strip) 50 wide and 180 high at the right. */
export function titleBlockRect(paper: { w: number; h: number }, frame: SheetFrame): Rect {
  const f = frameRect(paper, frame);
  const strip = frame.titleBlock === 'right';
  const w = strip ? TITLE_BLOCK_MM.h : TITLE_BLOCK_MM.w;
  const h = strip ? TITLE_BLOCK_MM.w : TITLE_BLOCK_MM.h;
  return { x: f.x + f.w - w, y: f.y + f.h - h, w, h };
}

/** What the drawings use: inside the frame, above the title block (or, for a strip, left of it). */
export function drawingAreaIn(paper: { w: number; h: number }, frame: SheetFrame): Rect {
  const f = frameRect(paper, frame);
  return frame.titleBlock === 'right' ? { ...f, w: f.w - TITLE_BLOCK_MM.h } : { ...f, h: f.h - TITLE_BLOCK_MM.h };
}

/** A paper and frame that cannot make a sheet: the frame line's size and the title block's, mm. */
export interface FrameProblem {
  frame: { w: number; h: number };
  titleBlock: { w: number; h: number };
}

/**
 * Why `frame` on `paper` cannot make a sheet: the frame line is too small for
 * the title block (as placed: across at the bottom, or a strip at the right),
 * or leaves no drawing area beside it. Null when it can.
 */
export function frameProblem(paper: { w: number; h: number }, frame: SheetFrame): FrameProblem | null {
  const f = frameRect(paper, frame);
  const tb = titleBlockRect(paper, frame);
  const area = drawingAreaIn(paper, frame);
  const fits = f.w >= tb.w && f.h >= tb.h && area.w > 0 && area.h > 0;
  return fits ? null : { frame: { w: f.w, h: f.h }, titleBlock: { w: tb.w, h: tb.h } };
}

const POSITIONS: readonly TitleBlockPosition[] = ['bottom-right', 'right'];
const margin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= MARGIN_MM.min && v <= MARGIN_MM.max;

/** A frame out of a file; undefined when it is not one (the sheet then has the default). */
export function readFrame(v: unknown): SheetFrame | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const o = v as { margins?: Record<string, unknown>; titleBlock?: unknown };
  const m = o.margins;
  if (!m || !margin(m.top) || !margin(m.right) || !margin(m.bottom) || !margin(m.left)) return undefined;
  const titleBlock = POSITIONS.find((p) => p === o.titleBlock) ?? 'bottom-right';
  return { margins: { top: m.top, right: m.right, bottom: m.bottom, left: m.left }, titleBlock };
}
