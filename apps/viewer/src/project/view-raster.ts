/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The size of a raster capture of the 3D viewport for a sheet: the viewport's
 * box on paper at print resolution. A perspective has no scale, so its box is
 * the whole story; it is pixels = ceil(mm * dpi / 25.4), reduced only by the
 * rasteriser's memory caps (`fitRasterPixels`, the same sum the shaded PDF
 * underlay uses), and the sheet places the image by its box in millimetres,
 * never by its pixel count.
 */

import { MAX_SHADING_DIMENSION_PX, MAX_SHADING_PIXELS, fitRasterPixels, type RasterFit } from '@ifc-lite/drawing-2d';
import type { ViewRaster } from './types';

/** Dots per inch a sheet raster is captured at. */
export const PRINT_DPI = 300;
/** The box a raster viewport takes when first placed, paper millimetres. */
export const RASTER_BOX_MM = { width: 150, height: 100 } as const;

export function rasterRequest(widthMm: number, heightMm: number, dpi = PRINT_DPI): RasterFit {
  return fitRasterPixels(widthMm, heightMm, dpi, MAX_SHADING_PIXELS, MAX_SHADING_DIMENSION_PX);
}

/** Whether a capture still fits the box it is placed in (same millimetres, to the pixel it would be asked for). */
export function rasterFits(raster: ViewRaster | null | undefined, box: { width: number; height: number }): boolean {
  if (!raster) return false;
  const want = rasterRequest(box.width, box.height);
  return raster.widthPx === want.widthPx && raster.heightPx === want.heightPx;
}
