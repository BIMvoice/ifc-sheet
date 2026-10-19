/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A raster capture of the 3D viewport for a sheet: the view's camera applied,
 * the viewport's canvas read through the renderer's `captureScreenshot` (the
 * one capture path the BCF, report and clash snapshots use), cropped to the
 * viewport box's aspect and resampled to the pixel size the box needs at print
 * resolution (`view-raster.ts`).
 *
 * The sizing and the crop are plain arithmetic and tested; the pixels come
 * from a live renderer and are checked by hand. The capture is of the canvas
 * as it is on screen, so a canvas with fewer pixels than the request is
 * enlarged, not sharper: `ViewRaster.widthPx` is the size delivered, not a
 * promise about detail.
 */

import { getGlobalRenderer } from '@/hooks/useBCF';
import { useViewerStore } from '@/store';
import type { CameraViewpoint } from '@/store/types';
import { rasterRequest } from '@/project/view-raster';
import type { ThreeDProjectView, ViewRaster } from '@/project/types';

export interface RasterCaptureDeps {
  /** A PNG data URL of exactly `widthPx` × `heightPx` showing the viewport from `viewpoint` (`null`: as it stands), or `null` when it cannot be captured. */
  capture(viewpoint: CameraViewpoint | null, widthPx: number, heightPx: number): Promise<string | null>;
}

/** The source rectangle of a `srcW` × `srcH` image that fills a `dstW` × `dstH` box with nothing stretched: the largest centred crop of the box's aspect. */
export function coverCrop(srcW: number, srcH: number, dstW: number, dstH: number): { x: number; y: number; width: number; height: number } {
  const wanted = dstW / dstH;
  const width = srcW / srcH > wanted ? srcH * wanted : srcW;
  const height = srcW / srcH > wanted ? srcH : srcW / wanted;
  return { x: (srcW - width) / 2, y: (srcH - height) / 2, width, height };
}

export async function captureViewRaster(
  view: ThreeDProjectView,
  box: { width: number; height: number },
  deps: RasterCaptureDeps = liveCapture,
): Promise<ViewRaster> {
  const { widthPx, heightPx } = rasterRequest(box.width, box.height);
  const href = await deps.capture(view.viewpoint, widthPx, heightPx);
  if (!href) throw new Error('the viewport has nothing to capture');
  return { href, widthPx, heightPx, widthMm: box.width, heightMm: box.height };
}

const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

const liveCapture: RasterCaptureDeps = {
  async capture(viewpoint, widthPx, heightPx) {
    const renderer = getGlobalRenderer();
    if (!renderer) return null;
    const { cameraCallbacks } = useViewerStore.getState();
    const before = viewpoint ? cameraCallbacks.getViewpoint?.() ?? null : null;
    try {
      if (viewpoint) cameraCallbacks.applyViewpoint?.(viewpoint, false);
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

async function resample(dataUrl: string, widthPx: number, heightPx: number): Promise<string> {
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const canvas = new OffscreenCanvas(widthPx, heightPx);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2D canvas to resample the capture on');
  const c = coverCrop(bitmap.width, bitmap.height, widthPx, heightPx);
  ctx.drawImage(bitmap, c.x, c.y, c.width, c.height, 0, 0, widthPx, heightPx);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('could not read the capture'));
    reader.readAsDataURL(blob);
  });
}
