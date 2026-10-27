/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * How far the Wall is zoomed, and where it was left. The zoom `k` multiplies the width a sheet hangs at (the sheets are
 * SVG in paper millimetres, so they stay sharp at any `k`); the scroll offsets are kept with it, so leaving the Wall for a
 * sheet and coming back finds it as it was. `resetWallView` forgets both when the project is replaced.
 */

import { create } from 'zustand';
import { rectGap, type PlacedSheet, type Rect } from './wall-geometry';

/** CSS defines 96 px to the inch: this many px to a CSS millimetre, so a sheet at 100 % is its paper size on screen. */
export const PX_PER_MM = 96 / 25.4;

/** Width of a sheet on the Wall at zoom 1, px. */
export const SHEET_PX = 340;

export const WALL_ZOOM = { min: 0.1, max: 12, step: 1.25 } as const;

/** Below this width a sheet hangs as an outline even when it is on screen: its drawing could not be read at that size. */
export const MIN_DRAWN_PX = 140;

export const clampZoom = (k: number): number => Math.min(WALL_ZOOM.max, Math.max(WALL_ZOOM.min, k));

/** The zoom one step in (`dir` 1) or out (-1) from `k`. */
export const stepZoom = (k: number, dir: 1 | -1): number => clampZoom(dir > 0 ? k * WALL_ZOOM.step : k / WALL_ZOOM.step);

/** The zoom at which a sheet now `widthPx` wide, at zoom `k`, shows at its paper width `paperMm`: 1 mm on paper is 1 mm on screen. */
export const trueSizeZoom = (k: number, widthPx: number, paperMm: number): number => clampZoom(k * (paperMm * PX_PER_MM) / widthPx);

/** A sheet's zoom level as a percent of its paper size on screen. */
export const zoomPercent = (widthPx: number, paperMm: number): number => Math.round((widthPx / (paperMm * PX_PER_MM)) * 100);

export function unionOf(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The factor to multiply the zoom by so `box` fills a screen of `screen` less `pad` px each side (what is fixed, like gaps, makes one factor only an estimate). */
export function fitFactor(box: Rect, screen: { w: number; h: number }, pad: number): number {
  return Math.min(Math.max(1, screen.w - 2 * pad) / Math.max(1, box.w), Math.max(1, screen.h - 2 * pad) / Math.max(1, box.h));
}

/** A point on a sheet as fractions of its frame, so it can be found again after the layout moved. */
export interface SheetAnchor {
  id: string;
  fx: number;
  fy: number;
}

/** The sheet under `point` (Wall content px), or the nearest one, with where in its frame the point lies. */
export function anchorAt(sheets: readonly PlacedSheet[], point: { x: number; y: number }): SheetAnchor | null {
  const probe: Rect = { x: point.x, y: point.y, w: 0, h: 0 };
  let best: PlacedSheet | null = null;
  let gap = Infinity;
  for (const s of sheets) {
    const g = rectGap(s.rect, probe);
    if (g < gap) {
      gap = g;
      best = s;
    }
  }
  if (!best) return null;
  return { id: best.id, fx: (point.x - best.rect.x) / best.rect.w, fy: (point.y - best.rect.y) / best.rect.h };
}

/** The neighbour of `current` in the Wall's order, `dir` along; stays on `current` at either end. */
export function neighbourSheet(order: readonly string[], current: string | null, dir: 1 | -1): string | null {
  if (order.length === 0) return null;
  const i = current ? order.indexOf(current) : -1;
  if (i < 0) return order[dir > 0 ? 0 : order.length - 1];
  return order[Math.min(order.length - 1, Math.max(0, i + dir))];
}

interface WallZoom {
  k: number;
  /** Where the Wall was scrolled to, px. */
  left: number;
  top: number;
  /** The sheet zoomed to or stepped to by the keys, or null. */
  current: string | null;
  /** Whether the arrow keys walk the sheets (after a zoom to a sheet) rather than scroll. */
  reading: boolean;
}

const INITIAL: WallZoom = { k: 1, left: 0, top: 0, current: null, reading: false };

export const useWallZoom = create<WallZoom>()(() => INITIAL);

export const resetWallZoom = (): void => useWallZoom.setState(INITIAL);
