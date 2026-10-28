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
 *
 * The underlays a sheet prints (#457) are drawn under its drawings, as the app's sheet draws them; the DXF leaves them out.
 *
 * The title block's logo is drawn when it is a PNG or JPEG (`printableLogo`).
 *
 * The drawings carry the app's pens (#34): each viewport's faces and lines as
 * `sheet-graphic.ts` grouped them through the view's styler, with the colour,
 * paper-mm width, dash and fill the app's sheet gives the same item.
 */

import { exportToDXF, type Drawing2D } from '@ifc-lite/drawing-2d';
import type { Polyline, SheetGraphic, SheetPen } from './sheet-graphic.js';
import { FILL_HATCH } from './sheet-colours.js';

/** jsPDF line widths, mm, of the sheet's own marks (the drawings take their pens from `sheet.pens`). */
const PEN = { frame: 0.5, mark: 0.18 } as const;

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
    // The pictures laid under the views (#457), beneath everything else, each clipped to its viewport's box: the app's `<image>` and its `matrix`.
    for (const u of sheet.underlays) {
      try {
        const { fileType } = doc.getImageProperties(u.src);
        const [a, b, c, d, e, f] = u.matrix;
        // jsPDF's `cm` is in PDF points with y up; the sheet's matrix is paper mm with y down. T = F M F^-1 for F(x, y) = (x s, (H - y) s).
        const s = 72 / 25.4;
        const H = sheet.paper.h;
        doc.saveGraphicsState();
        doc.rect(u.clip.x, u.clip.y, u.clip.w, u.clip.h, null);
        doc.clip();
        doc.discardPath();
        doc.setGState(doc.GState({ opacity: u.opacity }));
        doc.setCurrentTransformationMatrix(doc.Matrix(a, -b, -c, d, s * (c * H + e), s * (H - d * H - f)));
        doc.addImage(u.src, fileType, 0, 0, u.widthPx, u.heightPx, undefined, 'FAST');
        doc.restoreGraphicsState();
      } catch (error) {
        console.warn('[ifcsheet] an underlay could not be drawn in the PDF', error);
      }
    }
    // Every run is open: a closed ring repeats its first point (`sheet-graphic.ts`), a clipped one must not be closed across the cut.
    // A colour scheme's fills go down first, under every line; each region is one even-odd path, so a hole stays open.
    for (const fill of sheet.fills) {
      const ops = fill.loops.flatMap((pts) => [{ op: 'm', c: [pts[0].x, pts[0].y] }, ...pts.slice(1, -1).map((p) => ({ op: 'l', c: [p.x, p.y] })), { op: 'h' }]);
      doc.setFillColor(fill.colour);
      doc.path(ops).fillEvenOdd();
      // A value's hatch (#493) goes over its colour and under every line.
      if (fill.hatch) {
        doc.setDrawColor(FILL_HATCH.ink);
        stroke(fill.hatch.strokes, fill.hatch.width);
      }
    }
    // The drawings by pen, in the app's paint order: the cut faces' fills, then the hidden, seen and cut lines.
    for (const pen of sheet.pens) {
      if (pen.fill) {
        doc.setFillColor(pen.fill);
        for (const region of pen.regions) doc.path(region.flatMap((pts) => [{ op: 'm', c: [pts[0].x, pts[0].y] }, ...pts.slice(1, -1).map((p) => ({ op: 'l', c: [p.x, p.y] })), { op: 'h' }])).fillEvenOdd();
        continue;
      }
      doc.setDrawColor(pen.stroke ?? '#000000');
      doc.setLineDashPattern(pen.dash ? [...pen.dash] : [], 0);
      stroke(pen.runs, pen.width);
    }
    doc.setLineDashPattern([], 0);
    doc.setDrawColor('#000000');
    stroke(sheet.frame, PEN.frame);
    stroke(sheet.marks, PEN.mark);
    for (const t of sheet.texts) {
      // jsPDF sizes text in points.
      doc.setFontSize((t.size / 25.4) * 72);
      doc.text(t.text, t.at.x, t.at.y, { align: t.align ?? 'left', ...(t.angle ? { angle: t.angle } : {}) });
    }
    // The logo: fitted whole and centred in its box (the app's `xMidYMid meet`); in a strip it reads upward.
    for (const image of sheet.images) {
      try {
        const { width, height, fileType } = doc.getImageProperties(image.src);
        const turned = image.angle === 90;
        // The image's own width runs along the box's height when turned.
        const k = Math.min(image.box.w / (turned ? height : width), image.box.h / (turned ? width : height));
        const w = width * k;
        const h = height * k;
        const cx = image.box.x + image.box.w / 2;
        const cy = image.box.y + image.box.h / 2;
        // jsPDF turns the image about the point it is given; a quarter counter-clockwise puts the picture's x range at [x - h, x] and its y range at [y + h - w, y + h].
        if (turned) doc.addImage(image.src, fileType, cx + h / 2, cy + w / 2 - h, w, h, 'logo', 'FAST', 90);
        else doc.addImage(image.src, fileType, cx - w / 2, cy - h / 2, w, h, 'logo', 'FAST');
      } catch (error) {
        // A file the browser showed but jsPDF cannot decode: the sheet prints without its logo.
        console.warn('[ifcsheet] the logo could not be drawn in the PDF', error);
      }
    }
    doc.outline.add(null, `${sheet.number} ${sheet.name}`.trim(), { pageNumber: i + 1 });
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

/**
 * A colour scheme's fills as DXF layers (#92), one per colour (`COLOUR-77AADD`): R12 has no hatch, so each region is the closed
 * polylines of its boundary, as the exporter writes a cut face's hatch region, in the colour's nearest ACI colour.
 */
function colourLayers(sheet: SheetGraphic): { name: string; color: string; polylines: Polyline[]; closed: boolean }[] {
  const byColour = new Map<string, Polyline[]>();
  for (const fill of sheet.fills) byColour.set(fill.colour, [...(byColour.get(fill.colour) ?? []), ...fill.loops.map((l) => l.slice(0, -1))]);
  const layers = [...byColour].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([colour, polylines]) => ({ name: `COLOUR-${colour.slice(1).toUpperCase()}`, color: colour, polylines, closed: true }));
  // A value's hatch (#493): R12 has no pattern either, so its strokes are lines on a layer named for the pattern (`COLOUR-HATCH-PARQUET`).
  const byPattern = new Map<string, Polyline[]>();
  for (const fill of sheet.fills) if (fill.hatch) byPattern.set(fill.hatch.pattern, [...(byPattern.get(fill.hatch.pattern) ?? []), ...fill.hatch.strokes]);
  const hatches = [...byPattern].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([pattern, polylines]) => ({ name: `COLOUR-HATCH-${pattern.replace(/[^A-Za-z0-9_-]/g, '_').toUpperCase()}`, color: FILL_HATCH.ink, polylines, closed: false }));
  return [...layers, ...hatches];
}

/**
 * The drawings' stroke pens as DXF layers: R12 has no line weight, so a pen's layer names its kind and width in hundredths of a
 * millimetre (`VIEW-CUT-050`, `VIEW-SEEN-025`, `VIEW-HIDDEN-018`), and a colour other than black (`VIEW-CUT-050-C62828`); the layer
 * carries the colour. The cut faces' grey fills are not written: R12 has no hatch, and their outlines are the cut lines already.
 */
function penLayers(sheet: SheetGraphic): { name: string; color: string; polylines: Polyline[]; closed: boolean }[] {
  const byName = new Map<string, { name: string; color: string; polylines: Polyline[]; closed: boolean }>();
  for (const pen of sheet.pens.filter((p): p is SheetPen & { stroke: string } => p.stroke !== null && p.runs.length > 0)) {
    const colour = pen.stroke.toLowerCase() === '#000000' ? '' : `-${pen.stroke.slice(1).toUpperCase()}`;
    const name = `VIEW-${pen.layer}-${String(Math.round(pen.width * 100)).padStart(3, '0')}${colour}`;
    const layer = byName.get(name) ?? { name, color: pen.stroke, polylines: [], closed: false };
    layer.polylines.push(...pen.runs);
    byName.set(name, layer);
  }
  return [...byName.values()];
}

/** One sheet as DXF text (R12), paper millimetres with y up and the origin at the paper's bottom-left corner. */
export function exportDxf(sheet: SheetGraphic): string {
  const flip = (p: { x: number; y: number }) => ({ x: p.x, y: sheet.paper.h - p.y });
  return exportToDXF(emptyDrawing(sheet.paper), {
    metadataComment: `IfcSheet ${sheet.number} ${sheet.name}; units: paper millimetres`,
    coordinateTransform: flip,
    polylineLayers: [
      { name: 'SHEET-FRAME', color: '#000000', polylines: sheet.frame, closed: false },
      ...penLayers(sheet),
      { name: 'SHEET-MARKS', color: '#000000', polylines: sheet.marks, closed: false },
      ...colourLayers(sheet),
    ],
  });
}
