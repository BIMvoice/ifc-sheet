/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A page of a scanned PDF, or an image, laid under a view to trace over (#457). Pure data and geometry; the
 * project field is `fields/underlays.ts`, the commands are `underlay-actions.ts`, the picture is drawn by
 * `UnderlayLayer.tsx` (on screen) and `SheetPaper.tsx` (on a sheet).
 *
 * The bitmap is stored in the project as a data URL, like the title block's logo, already reduced to
 * `UNDERLAY_MAX_BYTES` (`underlay-import.ts`). Its place is in the view's drawing coordinates (metres): `at` is
 * where the picture's centre lies, `mPerPx` how many metres one pixel is, `rotation` the turn in radians
 * counter-clockwise in drawing space. A PDF page starts at its paper size (1:1), a picture at 96 dpi; the
 * person then sets the scale from a distance they know (`scaleByTwoPoints`).
 */

import { drawingToScreen, type SectionAxisName, type ViewTransform } from '@/drafting/frame';
import type { Pt } from '@/drafting/types';

/** The largest bitmap one underlay may store, in bytes of the image file; the data URL in the project file is a third larger. */
export const UNDERLAY_MAX_BYTES = 2 * 1024 * 1024;
/** The longest side, in pixels, an underlay is rendered or reduced to first. */
export const UNDERLAY_MAX_SIDE_PX = 3000;
/** The shortest side the reduction goes down to before the import is refused. */
export const UNDERLAY_MIN_SIDE_PX = 800;

export interface ViewUnderlay {
  id: string;
  /** The view it lies under. */
  viewId: string;
  name: string;
  kind: 'pdf' | 'image';
  /** For a PDF, the page (1-based). */
  page?: number;
  /** The bitmap as a `data:image/png|jpeg;base64,` URL. */
  href: string;
  widthPx: number;
  heightPx: number;
  /** The centre of the picture, view drawing coordinates (metres). */
  at: Pt;
  /** Metres per pixel. */
  mPerPx: number;
  /** Radians, counter-clockwise in drawing space. */
  rotation: number;
  /** 0 to 1. */
  opacity: number;
  /** Locked: position, scale and turn can not be changed until it is unlocked. */
  locked: boolean;
  /** The sheets that print it (ids). Absent or empty: it is not printed anywhere. */
  printOnSheets?: string[];
}

const DATA_URL = /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;

export function isUnderlayHref(v: unknown): v is string {
  return typeof v === 'string' && v.length < Math.ceil((UNDERLAY_MAX_BYTES * 4) / 3) + 64 && DATA_URL.test(v);
}

/** A picture pixel (x right, y down from its top-left corner) to the view's drawing point. */
export function pixelToDrawing(u: Pick<ViewUnderlay, 'at' | 'mPerPx' | 'rotation' | 'widthPx' | 'heightPx'>, px: Pt): Pt {
  const lx = (px.x - u.widthPx / 2) * u.mPerPx;
  const ly = -(px.y - u.heightPx / 2) * u.mPerPx;
  const c = Math.cos(u.rotation);
  const s = Math.sin(u.rotation);
  return { x: u.at.x + lx * c - ly * s, y: u.at.y + lx * s + ly * c };
}

/** The inverse of `pixelToDrawing`. */
export function drawingToPixel(u: Pick<ViewUnderlay, 'at' | 'mPerPx' | 'rotation' | 'widthPx' | 'heightPx'>, p: Pt): Pt {
  const dx = p.x - u.at.x;
  const dy = p.y - u.at.y;
  const c = Math.cos(u.rotation);
  const s = Math.sin(u.rotation);
  const lx = dx * c + dy * s;
  const ly = -dx * s + dy * c;
  return { x: lx / u.mPerPx + u.widthPx / 2, y: -ly / u.mPerPx + u.heightPx / 2 };
}

/**
 * The affine map [a, b, c, d, e, f] (the SVG / CSS `matrix`) from the picture's pixels to the plane it is drawn
 * on: a screen or a sheet's paper, as `transform` takes drawing points there. Right for every view axis, since
 * it goes through `drawingToScreen`.
 */
export function underlayMatrix(u: ViewUnderlay, transform: ViewTransform, axis: SectionAxisName): [number, number, number, number, number, number] {
  const o = drawingToScreen(pixelToDrawing(u, { x: 0, y: 0 }), transform, axis);
  const px = drawingToScreen(pixelToDrawing(u, { x: 1, y: 0 }), transform, axis);
  const py = drawingToScreen(pixelToDrawing(u, { x: 0, y: 1 }), transform, axis);
  return [px.x - o.x, px.y - o.y, py.x - o.x, py.y - o.y, o.x, o.y];
}

export const matrixText = (m: readonly number[]): string => `matrix(${m.map((n) => +n.toFixed(6)).join(' ')})`;

/**
 * The underlay scaled so that two points picked on the picture are `distance` metres apart, the first staying
 * where it is. Null when the points coincide or the distance is not a positive number.
 */
export function scaleByTwoPoints(u: ViewUnderlay, a: Pt, b: Pt, distance: number): ViewUnderlay | null {
  if (!(distance > 0) || !Number.isFinite(distance)) return null;
  const pa = drawingToPixel(u, a);
  const pb = drawingToPixel(u, b);
  const px = Math.hypot(pa.x - pb.x, pa.y - pb.y);
  if (!(px > 1e-9)) return null;
  const scaled = { ...u, mPerPx: distance / px };
  // Keep `a` fixed: the picture's pixel `pa` must land on `a` again.
  const now = pixelToDrawing(scaled, pa);
  return { ...scaled, at: { x: u.at.x + (a.x - now.x), y: u.at.y + (a.y - now.y) } };
}

/** Whether the underlay is on the paper of this sheet. */
export const printsOnSheet = (u: Pick<ViewUnderlay, 'printOnSheets'>, sheetId: string): boolean => u.printOnSheets?.includes(sheetId) === true;

/** The underlays under a view. */
export const underlaysOfView = (all: readonly ViewUnderlay[] | undefined, viewId: string): ViewUnderlay[] => (all ?? []).filter((u) => u.viewId === viewId);

/** The underlays of a view a sheet prints, in the order they were added. */
export const printedUnderlays = (all: readonly ViewUnderlay[] | undefined, viewId: string, sheetId: string): ViewUnderlay[] =>
  underlaysOfView(all, viewId).filter((u) => u.opacity > 0 && printsOnSheet(u, sheetId));

/**
 * The next side length to try when a render is over the byte cap: three quarters of the last, or null when that
 * would go below `UNDERLAY_MIN_SIDE_PX` (the import is then refused rather than stored unreadable).
 */
export function reducedSide(side: number): number | null {
  const next = Math.floor(side * 0.75);
  return next >= UNDERLAY_MIN_SIDE_PX ? next : null;
}

/** The names of the views on a sheet whose underlay the sheet prints: what a DXF of the sheet leaves out. */
export function omittedUnderlayViewNames(
  sheet: { id: string; viewports?: readonly { viewId: string }[] },
  views: readonly { id: string; name: string }[],
  all: readonly ViewUnderlay[] | undefined,
): string[] {
  const shown = new Set((sheet.viewports ?? []).map((vp) => vp.viewId));
  return views.filter((v) => shown.has(v.id) && printedUnderlays(all, v.id, sheet.id).length > 0).map((v) => v.name);
}
