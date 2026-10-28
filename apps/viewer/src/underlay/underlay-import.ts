/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Turning a PDF page or an image file into an underlay bitmap (#457) that fits the project: at most
 * `UNDERLAY_MAX_BYTES`. A PDF page is rendered by the PDF engine the appearance import already uses
 * (`lib/appearance/pdf`, a worker; the PDF's bytes are not kept, only the page picture); an image is drawn onto
 * a canvas. Either is made smaller, three quarters of the side at a time, until it fits, and refused below
 * `UNDERLAY_MIN_SIDE_PX` rather than stored too blurred to trace.
 */

import { createPdfWorkerClient } from '@/lib/appearance/pdf/worker-client';
import { reducedSide, UNDERLAY_MAX_BYTES, UNDERLAY_MAX_SIDE_PX, type ViewUnderlay } from './underlay';
import type { NewUnderlay } from './underlay-actions';

/** Metres per pixel of a picture with no size of its own: 96 dpi. */
const IMAGE_M_PER_PX = 0.0254 / 96;

export class UnderlayImportError extends Error {
  constructor(readonly code: 'too-large' | 'unreadable', message: string) {
    super(message);
    this.name = 'UnderlayImportError';
  }
}

/** One render of the source at a longest side: its encoded bytes, size and the metres a pixel is. */
export interface Rendered { bytes: Uint8Array; mime: 'image/png' | 'image/jpeg'; widthPx: number; heightPx: number; mPerPx: number }

/** The first render, from `UNDERLAY_MAX_SIDE_PX` down by `reducedSide`, whose bytes fit `cap`. */
export async function renderWithinCap(render: (side: number) => Promise<Rendered>, cap = UNDERLAY_MAX_BYTES): Promise<Rendered> {
  let side: number | null = UNDERLAY_MAX_SIDE_PX;
  while (side !== null) {
    const out = await render(side);
    if (out.bytes.length <= cap) return out;
    side = reducedSide(side);
  }
  throw new UnderlayImportError('too-large', `The picture does not fit ${Math.round(cap / 1024 / 1024)} MB even reduced; use a smaller scan.`);
}

export function dataUrl(bytes: Uint8Array, mime: string): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(text)}`;
}

export const isPdfFile = (file: { name: string; type: string }): boolean => file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

async function renderPdfPage(bytes: Uint8Array, page: number): Promise<Rendered> {
  const client = createPdfWorkerClient();
  try {
    return await renderWithinCap(async (side) => {
      const result = await client.run(bytes, { kind: 'raster', request: { pageNumber: page, dpi: 600, maxDimension: side, maxPixels: side * side } });
      if (result.kind !== 'raster') throw new UnderlayImportError('unreadable', 'The PDF page could not be drawn.');
      const { recipe } = result;
      return { bytes: result.png, mime: 'image/png', widthPx: recipe.pixelWidth, heightPx: recipe.pixelHeight, mPerPx: recipe.paperSizeMetres[0] / recipe.pixelWidth };
    });
  } finally {
    client.dispose();
  }
}

async function renderImage(file: Blob): Promise<Rendered> {
  const bitmap = await createImageBitmap(file);
  try {
    return await renderWithinCap(async (side) => {
      const k = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      const widthPx = Math.max(1, Math.round(bitmap.width * k));
      const heightPx = Math.max(1, Math.round(bitmap.height * k));
      const canvas = new OffscreenCanvas(widthPx, heightPx);
      const context = canvas.getContext('2d');
      if (!context) throw new UnderlayImportError('unreadable', 'This browser cannot draw pictures here.');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, widthPx, heightPx);
      context.drawImage(bitmap, 0, 0, widthPx, heightPx);
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
      return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: 'image/jpeg', widthPx, heightPx, mPerPx: IMAGE_M_PER_PX / k };
    });
  } finally {
    bitmap.close();
  }
}

/** The underlay for `viewId` made from a PDF (its page `page`, 1-based) or an image file, not yet placed in the project (`addUnderlay`). */
export async function underlayFromFile(file: File, viewId: string, page = 1): Promise<NewUnderlay> {
  const pdf = isPdfFile(file);
  let out: Rendered;
  try {
    out = pdf ? await renderPdfPage(new Uint8Array(await file.arrayBuffer()), page) : await renderImage(file);
  } catch (error) {
    if (error instanceof UnderlayImportError) throw error;
    throw new UnderlayImportError('unreadable', error instanceof Error ? error.message : String(error));
  }
  const kind: ViewUnderlay['kind'] = pdf ? 'pdf' : 'image';
  return { viewId, name: file.name, kind, ...(pdf ? { page } : {}), href: dataUrl(out.bytes, out.mime), widthPx: out.widthPx, heightPx: out.heightPx, mPerPx: out.mPerPx };
}
