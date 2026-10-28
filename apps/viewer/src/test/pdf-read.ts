/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Reading an issued PDF back with pdf.js, so a test sees what a reader of the
 * file sees: its bookmarks, its layers, the page boxes, and the straight
 * segments a page strokes, in millimetres from the page's top left.
 */

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

type Pdfjs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
export type PdfDoc = Awaited<ReturnType<Pdfjs['getDocument']>['promise']>;

const PT_MM = 25.4 / 72;

/**
 * `fontExtraProperties` makes pdf.js send a font's `name` (e.g. 'Times-Roman')
 * to `page.commonObjs`; since PDF.js 6.4 the name is only sent when asked for.
 */
export async function openPdf(bytes: Uint8Array, options: { fontExtraProperties?: boolean } = {}): Promise<{ pdf: PdfDoc; pdfjs: Pdfjs; close: () => Promise<void> }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const require = createRequire(import.meta.url);
  const task = pdfjs.getDocument({ data: bytes.slice(), enableXfa: false, stopAtErrors: true,
    fontExtraProperties: options.fontExtraProperties === true,
    standardFontDataUrl: `${join(dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts')}/` });
  return { pdf: await task.promise, pdfjs, close: () => task.destroy() };
}

export interface Segment { x1: number; y1: number; x2: number; y2: number; length: number; layer: string | null }

/** Matrix product a·b for pdf.js's [a b c d e f] (b applied first, then a). */
const mul = (m: number[], n: number[]) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];

/** The straight segments page `n` strokes, with the layer (optional-content name) each is drawn in; millimetres from the page's top left. */
export async function strokedSegments(pdf: PdfDoc, pdfjs: Pdfjs, n: number): Promise<Segment[]> {
  const page = await pdf.getPage(n);
  const [, , , height] = page.view;
  const config = await pdf.getOptionalContentConfig();
  const { OPS } = pdfjs;
  const STROKES = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const list = await page.getOperatorList();
  const out: Segment[] = [];
  const stack: number[][] = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const layers: (string | null)[] = [];
  let path: { x: number; y: number }[][] = [];
  const at = (x: number, y: number) => {
    const px = ctm[0] * x + ctm[2] * y + ctm[4];
    const py = ctm[1] * x + ctm[3] * y + ctm[5];
    return { x: px * PT_MM, y: (height - py) * PT_MM };
  };
  const flush = (stroke: boolean) => {
    if (stroke) {
      const layer = layers.at(-1) ?? null;
      for (const sub of path) {
        for (let i = 1; i < sub.length; i++) out.push({ x1: sub[i - 1].x, y1: sub[i - 1].y, x2: sub[i].x, y2: sub[i].y, length: Math.hypot(sub[i].x - sub[i - 1].x, sub[i].y - sub[i - 1].y), layer });
      }
    }
    path = [];
  };
  list.fnArray.forEach((fn, i) => {
    const args = list.argsArray[i] as unknown[];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = mul(ctm, args as number[]);
    else if (fn === OPS.beginMarkedContentProps) layers.push(config.getGroup(String((args[1] as { id?: string })?.id ?? ''))?.name ?? null);
    else if (fn === OPS.beginMarkedContent) layers.push(layers.at(-1) ?? null);
    else if (fn === OPS.endMarkedContent) layers.pop();
    else if (fn === OPS.constructPath) {
      // [paint operator, [path data: 0 move, 1 line, 2 curve, 3 quad, 4 close, each followed by its coordinates]]
      const [paint, parts] = args as [number, ArrayLike<number>[]];
      const d = Array.from(parts[0]);
      let k = 0;
      while (k < d.length) {
        const o = d[k++];
        if (o === 0) { path.push([at(d[k], d[k + 1])]); k += 2; }
        else if (o === 1) { path.at(-1)?.push(at(d[k], d[k + 1])); k += 2; }
        else if (o === 2) { const last = path.at(-1); if (last) last.push(at(d[k + 4], d[k + 5])); k += 6; }
        else if (o === 3) { const last = path.at(-1); if (last) last.push(at(d[k + 2], d[k + 3])); k += 4; }
        else if (o === 4) { const sub = path.at(-1); if (sub && sub.length > 1) sub.push(sub[0]); }
      }
      if (STROKES.has(paint)) flush(true);
      else if (paint !== -1 && paint !== undefined && paint !== OPS.constructPath) flush(false);
    } else if (STROKES.has(fn)) flush(true);
    else if (fn === OPS.fill || fn === OPS.eoFill || fn === OPS.endPath) flush(false);
  });
  page.cleanup();
  return out;
}
