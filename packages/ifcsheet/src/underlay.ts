/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A page of a scanned PDF, or an image, laid under a view to trace over (#457): the data, the one place its
 * picture is put on a plane, and which sheets print it. The app (`apps/viewer/src/underlay/`) and the
 * command-line build read and draw the same shapes through this module, so a headless sheet and the app's agree.
 *
 * The bitmap is stored in the project as a data URL, already reduced to `UNDERLAY_MAX_BYTES`. Its place is in the
 * view's drawing coordinates (metres): `at` is where the picture's centre lies, `mPerPx` how many metres one pixel
 * is, `rotation` the turn in radians counter-clockwise in drawing space.
 */

import type { Point2D } from '@ifc-lite/drawing-2d';

/** The largest bitmap one underlay may store, in bytes of the image file; the data URL in the project file is a third larger. */
export const UNDERLAY_MAX_BYTES = 2 * 1024 * 1024;

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
  at: Point2D;
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

type Placed = Pick<ViewUnderlay, 'at' | 'mPerPx' | 'rotation' | 'widthPx' | 'heightPx'>;

/** A picture pixel (x right, y down from its top-left corner) to the view's drawing point. */
export function pixelToDrawing(u: Placed, px: Point2D): Point2D {
  const lx = (px.x - u.widthPx / 2) * u.mPerPx;
  const ly = -(px.y - u.heightPx / 2) * u.mPerPx;
  const c = Math.cos(u.rotation);
  const s = Math.sin(u.rotation);
  return { x: u.at.x + lx * c - ly * s, y: u.at.y + lx * s + ly * c };
}

/** The inverse of `pixelToDrawing`. */
export function drawingToPixel(u: Placed, p: Point2D): Point2D {
  const dx = p.x - u.at.x;
  const dy = p.y - u.at.y;
  const c = Math.cos(u.rotation);
  const s = Math.sin(u.rotation);
  const lx = dx * c + dy * s;
  const ly = -dx * s + dy * c;
  return { x: lx / u.mPerPx + u.widthPx / 2, y: -ly / u.mPerPx + u.heightPx / 2 };
}

/** The affine map [a, b, c, d, e, f] (the SVG / CSS `matrix`). */
export type UnderlayMatrix = [number, number, number, number, number, number];

/**
 * THE transform of an underlay: the matrix from the picture's pixels to the plane it is drawn on, where
 * `toPlane` takes a drawing point there (the app's `drawingToScreen` with the viewport's transform, or the
 * engine's `placer`). The app's sheet SVG and the engine's PDF both build their `<image>` from this.
 */
export function underlayMatrix(u: Placed, toPlane: (p: Point2D) => Point2D): UnderlayMatrix {
  const o = toPlane(pixelToDrawing(u, { x: 0, y: 0 }));
  const px = toPlane(pixelToDrawing(u, { x: 1, y: 0 }));
  const py = toPlane(pixelToDrawing(u, { x: 0, y: 1 }));
  return [px.x - o.x, px.y - o.y, py.x - o.x, py.y - o.y, o.x, o.y];
}

/**
 * The matrix as text for both an SVG `transform` attribute and a CSS `transform`: the comma-separated form, since
 * CSS rejects the space-separated one (the screen layer then drew the picture untransformed at its pixel size).
 * Nine decimals: a pixel is a thousandth of a millimetre on paper and the picture is thousands of pixels wide.
 */
export const matrixText = (m: readonly number[]): string => `matrix(${m.map((n) => +n.toFixed(9)).join(', ')})`;

/** Whether the underlay is on the paper of this sheet. */
export const printsOnSheet = (u: Pick<ViewUnderlay, 'printOnSheets'>, sheetId: string): boolean => u.printOnSheets?.includes(sheetId) === true;

/** The underlays under a view. */
export const underlaysOfView = (all: readonly ViewUnderlay[] | undefined, viewId: string): ViewUnderlay[] => (all ?? []).filter((u) => u.viewId === viewId);

/** The underlays of a view a sheet prints, in the order they were added. */
export const printedUnderlays = (all: readonly ViewUnderlay[] | undefined, viewId: string, sheetId: string): ViewUnderlay[] =>
  underlaysOfView(all, viewId).filter((u) => u.opacity > 0 && printsOnSheet(u, sheetId));

/** The names of the views on a sheet whose underlay the sheet prints: what a DXF of the sheet leaves out. */
export function omittedUnderlayViewNames(
  sheet: { id: string; viewports?: readonly { viewId: string }[] },
  views: readonly { id: string; name: string }[],
  all: readonly ViewUnderlay[] | undefined,
): string[] {
  const shown = new Set((sheet.viewports ?? []).map((vp) => vp.viewId));
  return views.filter((v) => shown.has(v.id) && printedUnderlays(all, v.id, sheet.id).length > 0).map((v) => v.name);
}
