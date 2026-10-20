/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where the sheets are on the Wall, as pure geometry: which of them are near
 * enough to the screen to be drawn (nearest first), where to scroll to bring a
 * point or a sheet to the middle, and the corner map of the whole Wall. All
 * rectangles are in the Wall's own content coordinates, px.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedSheet {
  id: string;
  rect: Rect;
}

export const centreOf = (r: Rect): { x: number; y: number } => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** The straight gap between two rectangles: 0 when they touch or overlap. */
export function rectGap(a: Rect, b: Rect): number {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return Math.hypot(dx, dy);
}

/**
 * The sheets within `margin` px of the viewport, nearest first. Sheets that
 * are on screen tie on a gap of 0 and are told apart by how far their middle
 * is from the middle of the screen; a remaining tie keeps the Wall's order.
 */
export function visibleSheets(sheets: readonly PlacedSheet[], viewport: Rect, margin: number): string[] {
  const mid = centreOf(viewport);
  return sheets
    .map((s, order) => {
      const c = centreOf(s.rect);
      return { id: s.id, order, gap: rectGap(s.rect, viewport), mid: Math.hypot(c.x - mid.x, c.y - mid.y) };
    })
    .filter((s) => s.gap <= margin)
    .sort((a, b) => a.gap - b.gap || a.mid - b.mid || a.order - b.order)
    .map((s) => s.id);
}

/**
 * The sheets whose drawings are kept: those near now, nearest first, then the
 * ones that were near before (a drawing once made is not thrown away when the
 * sheet scrolls off, so coming back is instant).
 */
export function drawnQueue(previous: readonly string[], near: readonly string[]): string[] {
  const now = new Set(near);
  return [...near, ...previous.filter((id) => !now.has(id))];
}

/** Whether two id lists are the same ids in the same order. */
export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

export interface Size {
  w: number;
  h: number;
}

/** The scroll offsets that put `centre` in the middle of the viewport, kept inside the content. */
export function scrollToCentre(centre: { x: number; y: number }, viewport: Size, content: Size): { left: number; top: number } {
  const fit = (c: number, view: number, whole: number) => Math.max(0, Math.min(c - view / 2, whole - view));
  return { left: fit(centre.x, viewport.w, content.w), top: fit(centre.y, viewport.h, content.h) };
}

/** The corner map only helps when the Wall is larger than the screen, in either direction. */
export function wallOverflows(viewport: Size, content: Size): boolean {
  return content.w > viewport.w + 1 || content.h > viewport.h + 1;
}

export interface MiniMap {
  /** Size of the map, px. */
  size: Size;
  /** Each sheet's outline in map px. */
  sheets: PlacedSheet[];
  /** The screen's rectangle in map px. */
  view: Rect;
  /** Map px per Wall px. */
  k: number;
}

/**
 * The Wall shrunk to fit a box of `box` px (never enlarged): every sheet's
 * outline and the rectangle the screen covers.
 */
export function miniMap(sheets: readonly PlacedSheet[], viewport: Rect, content: Size, box: Size): MiniMap {
  const k = content.w > 0 && content.h > 0 ? Math.min(box.w / content.w, box.h / content.h, 1) : 1;
  const scale = (r: Rect): Rect => ({ x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k });
  return {
    size: { w: content.w * k, h: content.h * k },
    sheets: sheets.map((s) => ({ id: s.id, rect: scale(s.rect) })),
    view: scale(viewport),
    k,
  };
}

/** A point on the map (px, from its top-left) as the point on the Wall it stands for. */
export function mapToWall(point: { x: number; y: number }, map: Pick<MiniMap, 'k'>): { x: number; y: number } {
  return { x: point.x / map.k, y: point.y / map.k };
}
