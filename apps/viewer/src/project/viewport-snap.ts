/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Arranging viewports on a sheet (#186). While a viewport is dragged, its edges and centre snap to the lines
 * that matter on the paper: the frame (the margins), the drawing area and the title block, and the edges and
 * centres of the sheet's other viewports. One path serves every kind of viewport (views, schedules, legends).
 * The tolerance is a distance on the SCREEN (`SNAP_PX`), converted to paper mm at the canvas zoom, so snapping
 * feels the same at any zoom. A key nudge moves a viewport by exactly 1 mm, or 10 mm with Shift.
 */

import { runAsOneUndoStep } from '@/drafting/draft-store';
import { drawingAreaIn, frameOf, frameRect, titleBlockRect, type Rect } from './sheet-frame';
import { paperOf, updateViewport } from './sheets';
import type { ProjectSheet, SheetViewport } from './types';

/** How near, on screen, an edge must come to a line to snap to it. */
export const SNAP_PX = 8;

/** A key nudge, paper mm: plain, and with Shift. */
export const NUDGE_MM = { step: 1, big: 10 } as const;

/** A viewport's box on the paper: its centre and size, as the sheet stores them. */
export interface SnapBox { x: number; y: number; width: number; height: number }

/** A line to snap to: `at` on its axis (`x` = a vertical line), spanning `from`..`to` on the other axis. */
export interface SnapLine { axis: 'x' | 'y'; at: number; from: number; to: number }

export interface Snapped {
  /** The box's centre after snapping. */
  x: number;
  y: number;
  /** The lines the box's edges or centre now sit on, to draw while the drag lasts. */
  guides: SnapLine[];
}

/** The snap tolerance in paper mm at canvas zoom `k` (screen px per mm). */
export const snapTolerance = (k: number): number => SNAP_PX / k;

const linesOf = (r: Rect): SnapLine[] => [
  { axis: 'x', at: r.x, from: r.y, to: r.y + r.h },
  { axis: 'x', at: r.x + r.w / 2, from: r.y, to: r.y + r.h },
  { axis: 'x', at: r.x + r.w, from: r.y, to: r.y + r.h },
  { axis: 'y', at: r.y, from: r.x, to: r.x + r.w },
  { axis: 'y', at: r.y + r.h / 2, from: r.x, to: r.x + r.w },
  { axis: 'y', at: r.y + r.h, from: r.x, to: r.x + r.w },
];

export const rectOf = (b: SnapBox): Rect => ({ x: b.x - b.width / 2, y: b.y - b.height / 2, w: b.width, h: b.height });

/**
 * What a viewport on `sheet` snaps to: the frame line (the margins), the drawing area inside it, the title block, and
 * the edges and centres of `others` (the sheet's other viewports, boxes as drawn).
 */
export function snapTargets(sheet: ProjectSheet, others: readonly SnapBox[]): SnapLine[] {
  const paper = paperOf(sheet);
  const frame = frameOf(sheet);
  return [
    ...linesOf(frameRect(paper, frame)),
    ...linesOf(drawingAreaIn(paper, frame)),
    ...linesOf(titleBlockRect(paper, frame)),
    ...others.flatMap((o) => linesOf(rectOf(o))),
  ];
}

/** The nearest line of `axis` to one of the box's three lines (low edge, centre, high edge) within `tol`, as the centre it puts the box at. */
function nearest(centre: number, size: number, axis: 'x' | 'y', targets: readonly SnapLine[], tol: number): number | null {
  let best: { at: number; gap: number } | null = null;
  for (const line of targets) {
    if (line.axis !== axis) continue;
    for (const offset of [-size / 2, 0, size / 2]) {
      const gap = Math.abs(centre + offset - line.at);
      if (gap <= tol && (!best || gap < best.gap)) best = { at: line.at - offset, gap };
    }
  }
  return best ? best.at : null;
}

/**
 * `box` moved to where its edges and centre snap to `targets` within `tol` paper mm, on each axis on its own.
 * A box with no line near it stays where it is. The guides are the lines it sits on after snapping, each
 * stretched to cover the box too.
 */
export function snapMove(box: SnapBox, targets: readonly SnapLine[], tol: number): Snapped {
  const x = nearest(box.x, box.width, 'x', targets, tol) ?? box.x;
  const y = nearest(box.y, box.height, 'y', targets, tol) ?? box.y;
  const snapped = rectOf({ ...box, x, y });
  const on = (axis: 'x' | 'y', value: number, size: number): SnapLine[] => targets
    .filter((l) => l.axis === axis && [-size / 2, 0, size / 2].some((o) => Math.abs(value + o - l.at) < 1e-9))
    .map((l) => (axis === 'x'
      ? { ...l, from: Math.min(l.from, snapped.y), to: Math.max(l.to, snapped.y + snapped.h) }
      : { ...l, from: Math.min(l.from, snapped.x), to: Math.max(l.to, snapped.x + snapped.w) }));
  return { x, y, guides: [...(x !== box.x ? on('x', x, box.width) : []), ...(y !== box.y ? on('y', y, box.height) : [])] };
}

/** Move the viewport by (`dx`, `dy`) paper mm as ONE undo step. */
export function nudgeViewport(sheetId: string, vp: Pick<SheetViewport, 'id' | 'x' | 'y'>, dx: number, dy: number): void {
  runAsOneUndoStep(() => updateViewport(sheetId, vp.id, { x: vp.x + dx, y: vp.y + dy }));
}
