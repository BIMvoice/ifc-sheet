/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A raster capture of the 3D viewport for a sheet: the view's camera applied
 * (its saved one, else its preset corner framed on the model, `captureViewpoint`),
 * the viewport's canvas read through the renderer's `captureScreenshot` (the
 * one capture path the BCF, report and clash snapshots use), cropped to the
 * viewport box's aspect and reduced, if larger, to the pixel size the box
 * needs at print resolution (`view-raster.ts`).
 *
 * The renderer draws only into its on-screen canvas (no offscreen target of
 * another size), so a capture has at most the pixels the 3D view has on
 * screen. It is never enlarged to the print request: a canvas with fewer
 * pixels is delivered as it is, and the effective dpi it gives on paper
 * (`effectiveDpi`) is what the card reports, not the 300 dpi asked for.
 *
 * The sizing and the crop are plain arithmetic and tested; the pixels come
 * from a live renderer.
 */

import { getGlobalRenderer } from '@/hooks/useBCF';
import { useViewerStore } from '@/store';
import type { CameraViewpoint } from '@/store/types';
import { rasterRequest } from '@/project/view-raster';
import { captureViewpoint } from '@/project/axonometric';
import { mergedSectionBounds, type AxisBounds } from '@/lib/section/section-distance';
import type { ThreeDProjectView, ViewRaster } from '@/project/types';

/** A capture as delivered: a PNG data URL and its own pixel size. */
export interface CapturedImage {
  href: string;
  widthPx: number;
  heightPx: number;
}

export interface RasterCaptureDeps {
  /** The viewport from `viewpoint`, cropped to the aspect of `widthPx` × `heightPx` and no larger than that, or `null` when it cannot be captured. */
  capture(viewpoint: CameraViewpoint, widthPx: number, heightPx: number): Promise<CapturedImage | null>;
  /** The loaded models' box in the renderer frame, which a preset corner is framed on; `null` with none. */
  modelBounds(): AxisBounds | null;
}

/** The source rectangle of a `srcW` × `srcH` image that fills a `dstW` × `dstH` box with nothing stretched: the largest centred crop of the box's aspect. */
export function coverCrop(srcW: number, srcH: number, dstW: number, dstH: number): { x: number; y: number; width: number; height: number } {
  const wanted = dstW / dstH;
  const width = srcW / srcH > wanted ? srcH * wanted : srcW;
  const height = srcW / srcH > wanted ? srcH : srcW / wanted;
  return { x: (srcW - width) / 2, y: (srcH - height) / 2, width, height };
}

/** The pixel size a `cropW` × `cropH` crop is delivered at for a `reqW` × `reqH` request: reduced to it when larger, never enlarged. */
export function deliveredSize(cropW: number, cropH: number, reqW: number, reqH: number): { widthPx: number; heightPx: number } {
  const k = Math.min(1, reqW / cropW, reqH / cropH);
  return { widthPx: Math.max(1, Math.round(cropW * k)), heightPx: Math.max(1, Math.round(cropH * k)) };
}

export async function captureViewRaster(
  view: ThreeDProjectView,
  box: { width: number; height: number },
  deps: RasterCaptureDeps = liveCapture,
): Promise<ViewRaster> {
  const { widthPx, heightPx } = rasterRequest(box.width, box.height);
  // A preset corner (or no saved camera) is turned into a camera first, so the capture is of that corner.
  const viewpoint = captureViewpoint(view, deps.modelBounds());
  if (!viewpoint) throw new Error('no model is loaded to frame the view on');
  const image = await deps.capture(viewpoint, widthPx, heightPx);
  if (!image) throw new Error('the viewport has nothing to capture');
  return { href: image.href, widthPx: image.widthPx, heightPx: image.heightPx, widthMm: box.width, heightMm: box.height };
}

const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

const liveCapture: RasterCaptureDeps = {
  modelBounds() {
    const { models, geometryResult } = useViewerStore.getState();
    return mergedSectionBounds(models, geometryResult);
  },
  async capture(viewpoint, widthPx, heightPx) {
    const renderer = getGlobalRenderer();
    if (!renderer) return null;
    const { cameraCallbacks } = useViewerStore.getState();
    const before = cameraCallbacks.getViewpoint?.() ?? null;
    try {
      cameraCallbacks.applyViewpoint?.(viewpoint, false);
      // FRAME-WAIT-ALLOW(#2385): the frame must be presented before the canvas is read.
      await nextFrame();
      await nextFrame();
      const shot = await renderer.captureScreenshot();
      return shot ? await resample(shot, widthPx, heightPx) : null;
    } finally {
      if (before) cameraCallbacks.applyViewpoint?.(before, false);
    }
  },
};

async function resample(dataUrl: string, reqW: number, reqH: number): Promise<CapturedImage> {
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const c = coverCrop(bitmap.width, bitmap.height, reqW, reqH);
  const { widthPx, heightPx } = deliveredSize(c.width, c.height, reqW, reqH);
  const canvas = new OffscreenCanvas(widthPx, heightPx);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2D canvas to crop the capture on');
  ctx.drawImage(bitmap, c.x, c.y, c.width, c.height, 0, 0, widthPx, heightPx);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return await new Promise<CapturedImage>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ href: String(reader.result), widthPx, heightPx });
    reader.onerror = () => reject(reader.error ?? new Error('could not read the capture'));
    reader.readAsDataURL(blob);
  });
}
