/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The size of a raster capture of the 3D viewport for a sheet: the viewport's
 * box on paper at print resolution. A perspective has no scale, so its box is
 * the whole story; the request is pixels = ceil(mm * dpi / 25.4), reduced
 * only by the rasteriser's memory caps (`fitRasterPixels`, the same sum the
 * shaded PDF underlay uses). A capture delivers at most that, and fewer when
 * the 3D view on screen has fewer (`view-raster-capture.ts`), so its real
 * resolution is `effectiveDpi`. The sheet places the image by its box in
 * millimetres, never by its pixel count.
 */

import { MAX_SHADING_DIMENSION_PX, MAX_SHADING_PIXELS, fitRasterPixels, type RasterFit } from '@ifc-lite/drawing-2d';
import { isRasterView } from './axonometric';
import type { ProjectSheet, ProjectView, ViewRaster } from './types';

/** Dots per inch a sheet raster is captured at. */
export const PRINT_DPI = 300;
/** The box a raster viewport takes when first placed, paper millimetres. */
export const RASTER_BOX_MM = { width: 150, height: 100 } as const;

export function rasterRequest(widthMm: number, heightMm: number, dpi = PRINT_DPI): RasterFit {
  return fitRasterPixels(widthMm, heightMm, dpi, MAX_SHADING_PIXELS, MAX_SHADING_DIMENSION_PX);
}

/** Whether a capture still fits the box it is placed in: it was taken for the same millimetres. */
export function rasterFits(raster: ViewRaster | null | undefined, box: { width: number; height: number }): boolean {
  if (!raster) return false;
  return Math.abs(raster.widthMm - box.width) < 0.01 && Math.abs(raster.heightMm - box.height) < 0.01;
}

/**
 * The resolution a capture has on paper, dots per inch: its pixels over its
 * box, the lower of the two axes, rounded down. A capture of a 3D view on
 * screen has the canvas's pixels, so this is usually below `PRINT_DPI`.
 */
export function effectiveDpi(raster: Pick<ViewRaster, 'widthPx' | 'heightPx' | 'widthMm' | 'heightMm'>): number {
  return Math.floor(Math.min((raster.widthPx * 25.4) / raster.widthMm, (raster.heightPx * 25.4) / raster.heightMm));
}

/**
 * The names of the views a sheet prints as raster images. DXF has no image
 * here (`sheet-dxf.ts` walks only lines and text), so a DXF of the sheet says
 * these are left out instead of handing over empty frames.
 */
export function rasterViewNames(sheet: ProjectSheet, views: readonly ProjectView[]): string[] {
  const names: string[] = [];
  for (const vp of sheet.viewports ?? []) {
    const view = views.find((v) => v.id === vp.viewId);
    if (view && isRasterView(view) && !names.includes(view.name)) names.push(view.name);
  }
  return names;
}
