/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A set as files, from the sheet layouts (`sheet-graphic.ts`): one PDF with a
 * page per sheet, each page the sheet's paper size at true scale, and one DXF
 * per sheet in paper millimetres. Both run in Node: jsPDF draws vector lines
 * and text in an embedded Inter (the font the app's issued PDFs embed, for
 * ș, ț and the rest of Latin Extended), needing no canvas or DOM, and the DXF
 * is written by `@ifc-lite/drawing-2d`'s exporter.
 *
 * Not yet what the app exports: the app prints its sheet SVG through svg2pdf
 * (with layers, embedded fonts and archival metadata, `issue/pdf-build.ts`)
 * and writes R2000 DXF with CAD layers and text (`sheet-dxf.ts`). Both need
 * the sheet SVG, which only the browser renders today. The DXF here carries
 * linework only; its text is written once the app's DXF writer moves here.
 */

import { exportToDXF, type Drawing2D } from '@ifc-lite/drawing-2d';
import type { SheetGraphic } from './sheet-graphic.js';

/** jsPDF line widths, mm: the frame heavier than the drawing, cut faces heavier than what is seen beyond. */
const PEN = { frame: 0.5, cut: 0.35, line: 0.18 } as const;

/** The font file the package ships (`fonts/Inter-Regular.ttf`, SIL Open Font License), read from disk in Node. */
async function packagedFont(): Promise<Uint8Array> {
  const { readFile } = await import('node:fs/promises');
  return new Uint8Array(await readFile(new URL('../fonts/Inter-Regular.ttf', import.meta.url)));
}

const binary = (bytes: Uint8Array): string => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return out;
};

export interface PdfOptions {
  title?: string;
  /**
   * A TrueType font to set the text in. Default: the Inter the package ships,
   * read from disk (Node). In a browser, pass the bytes (the app serves the
   * same file at `fonts/Inter-Regular.ttf`).
   */
  font?: Uint8Array;
}

/** The set as one PDF, a page per sheet in the order given. Empty input makes no PDF. */
export async function exportPdf(sheets: readonly SheetGraphic[], options: PdfOptions = {}): Promise<Uint8Array> {
  if (sheets.length === 0) throw new Error('A PDF needs at least one sheet.');
  const { jsPDF } = await import('jspdf');
  const font = options.font ?? await packagedFont();
  const page = (s: SheetGraphic): { format: number[]; orientation: 'landscape' | 'portrait' } => ({ format: [s.paper.w, s.paper.h], orientation: s.paper.w > s.paper.h ? 'landscape' : 'portrait' });
  const doc = new jsPDF({ unit: 'mm', ...page(sheets[0]), compress: true });
  doc.setProperties({ title: options.title ?? '', creator: 'IfcSheet' });
  doc.addFileToVFS('Inter-Regular.ttf', binary(font));
  doc.addFont('Inter-Regular.ttf', 'Inter', 'normal', undefined, 'Identity-H');
  doc.setFont('Inter', 'normal');
  sheets.forEach((sheet, i) => {
    if (i > 0) doc.addPage(page(sheet).format, page(sheet).orientation);
    const stroke = (polylines: SheetGraphic['frame'], width: number) => {
      doc.setLineWidth(width);
      for (const pts of polylines) {
        if (pts.length < 2) continue;
        const deltas = pts.slice(1).map((p, j) => [p.x - pts[j].x, p.y - pts[j].y]);
        doc.lines(deltas, pts[0].x, pts[0].y, [1, 1], 'S', false);
      }
    };
    // Every run is open: a closed ring repeats its first point (`sheet-graphic.ts`), a clipped one must not be closed across the cut.
    stroke(sheet.frame, PEN.frame);
    stroke(sheet.cut, PEN.cut);
    stroke(sheet.lines, PEN.line);
    for (const t of sheet.texts) {
      // jsPDF sizes text in points.
      doc.setFontSize((t.size / 25.4) * 72);
      doc.text(t.text, t.at.x, t.at.y, { align: t.align ?? 'left' });
    }
    doc.outline.add(null, `${sheet.number} ${sheet.name}`, { pageNumber: i + 1 });
  });
  return new Uint8Array(doc.output('arraybuffer'));
}

/** A drawing with nothing in it: the sheet's shapes travel as the exporter's extra layers. */
function emptyDrawing(paper: { w: number; h: number }): Drawing2D {
  return {
    config: { plane: { axis: 'y', position: 0, flipped: false }, projectionDepth: 0, includeHiddenLines: false, creaseAngle: 30, scale: 1 },
    lines: [], cutPolygons: [], projectionPolygons: [],
    bounds: { min: { x: 0, y: 0 }, max: { x: paper.w, y: paper.h } },
    stats: { cutLineCount: 0, projectionLineCount: 0, hiddenLineCount: 0, silhouetteLineCount: 0, polygonCount: 0, totalTriangles: 0, processingTimeMs: 0 },
  };
}

/** One sheet as DXF text (R12), paper millimetres with y up and the origin at the paper's bottom-left corner. */
export function exportDxf(sheet: SheetGraphic): string {
  const flip = (p: { x: number; y: number }) => ({ x: p.x, y: sheet.paper.h - p.y });
  return exportToDXF(emptyDrawing(sheet.paper), {
    metadataComment: `IfcSheet ${sheet.number} ${sheet.name}; units: paper millimetres`,
    coordinateTransform: flip,
    polylineLayers: [
      { name: 'SHEET-FRAME', color: '#000000', polylines: sheet.frame, closed: false },
      { name: 'VIEW-CUT', color: '#000000', polylines: sheet.cut, closed: false },
      { name: 'VIEW-LINES', color: '#808080', polylines: sheet.lines, closed: false },
    ],
  });
}
