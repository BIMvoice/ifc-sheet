/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * An underlay the project prints (#457) in the engine's PDF: placed by the one matrix the app's sheet SVG uses
 * (`underlayMatrix`), only on the sheets it names, read from the project file by the app's reader, and left out
 * of the DXF with the views named.
 */

import { deflateSync, inflateSync } from 'node:zlib';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { describe, expect, it } from 'vitest';
import type { ProjectDocument, ProjectSheet } from './document.js';
import { exportPdf } from './export.js';
import { placer, sheetGraphic } from './sheet-graphic.js';
import { underlayNotes } from './cli-underlays.js';
import { omittedUnderlayViewNames, underlayMatrix, type ViewUnderlay } from './underlay.js';
import { readUnderlays } from './underlay-read.js';
import { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION } from './project-version.js';
import { readProjectFile } from './project-read.js';

/** A 2 x 2 px red PNG, made here (no binary in the repository). */
const PNG = ((): string => {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf: Buffer): number => { let c = 0xffffffff; for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0); header.writeUInt32BE(2, 4); header[8] = 8; header[9] = 2;
  const row = Buffer.from([0, 255, 0, 0, 255, 0, 0]);
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat([row, row]))), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${png.toString('base64')}`;
})();

const drawing = (axis: 'x' | 'y' | 'z'): Drawing2D => ({
  config: { plane: { axis, position: 0, flipped: false }, projectionDepth: 0, includeHiddenLines: false, creaseAngle: 30, scale: 50 },
  lines: [{ line: { start: { x: 0, y: 0 }, end: { x: 10, y: 4 } }, category: 'projection', visibility: 'visible', entityId: 1, ifcType: 'IfcWall', modelIndex: 0, depth: 0 }],
  cutPolygons: [], projectionPolygons: [],
  bounds: { min: { x: 0, y: 0 }, max: { x: 10, y: 4 } },
  stats: { cutLineCount: 0, projectionLineCount: 1, hiddenLineCount: 0, silhouetteLineCount: 0, polygonCount: 0, totalTriangles: 0, processingTimeMs: 0 },
});

const sheet = (id: string): ProjectSheet => ({
  id, number: id.toUpperCase(), name: id, createdAt: 0, paper: 'A3', orientation: 'landscape',
  viewports: [{ id: `vp-${id}`, viewId: 'v1', x: 200, y: 150, scale: 50, width: 0, height: 0, center: null }],
});

const underlay: ViewUnderlay = {
  id: 'u1', viewId: 'v1', name: 'Plan scanat', kind: 'image', href: PNG, widthPx: 2, heightPx: 2,
  at: { x: 3, y: 1.5 }, mPerPx: 1.5, rotation: 0.4, opacity: 0.5, locked: false, printOnSheets: ['s1'],
};

const doc = (): ProjectDocument => ({
  name: 'Casă', models: [], sheets: [sheet('s1'), sheet('s2')], underlays: [underlay],
  views: [{ id: 'v1', kind: 'plan', name: 'Parter', createdAt: 0, cutHeight: 1.2, level: { name: 'Parter', elevation: 0, storeyGlobalIds: [] } }],
});

const graphicOf = (id: string, axis: 'x' | 'y' | 'z' = 'y') => sheetGraphic(doc().sheets.find((s) => s.id === id)!, doc(), new Map([['v1', drawing(axis)]]));

/** The PDF's page content, inflated. */
const contents = (pdf: Uint8Array): string => {
  const text = Buffer.from(pdf).toString('latin1');
  const out: string[] = [];
  for (const m of text.matchAll(/stream\r?\n/g)) {
    const start = m.index + m[0].length;
    const end = text.indexOf('endstream', start);
    try { out.push(inflateSync(Buffer.from(text.slice(start, end), 'latin1')).toString('latin1')); } catch { /* an image or font stream */ }
  }
  return out.join('\n');
};

/** The `cm` matrices set just before an image's `Do`, mapped back from PDF points (y up) to paper mm (y down). */
const placedMatrices = (page: string, paperH: number): number[][] => {
  const s = 72 / 25.4;
  const found: number[][] = [];
  for (const m of page.matchAll(/gs\s+(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) cm\s+q[^Q]*?\/I\d+ Do/g)) {
    const [A, B, C, D, E, F] = m.slice(1).map(Number);
    // The inverse of T = F M F^-1 (see `export.ts`): M = F^-1 T F.
    found.push([A, -B, -C, D, E / s - (-C) * paperH, paperH - F / s - D * paperH]);
  }
  return found;
};

describe('an underlay in the headless PDF (#457)', () => {
  it('the sheet carries the matrix the app computes with the same shared function, through the viewport placer', () => {
    const g = graphicOf('s1');
    expect(g.underlays).toHaveLength(1);
    const at = placer(drawing('y'), doc().sheets[0].viewports![0]);
    expect(g.underlays[0].matrix).toEqual(underlayMatrix(underlay, at));
    // 1:50 is 20 mm a metre and a pixel is 1.5 m: a pixel edge is 30 mm long on the paper, turned 0.4 rad.
    const [a, b] = g.underlays[0].matrix;
    expect(Math.hypot(a, b)).toBeCloseTo(30, 6);
    expect(Math.atan2(b, a)).toBeCloseTo(0.4, 6);
  });

  it('a section (y up) and an east elevation (x mirrored) place it as their drawing is placed', () => {
    for (const axis of ['z', 'x'] as const) {
      const g = graphicOf('s1', axis);
      expect(g.underlays[0].matrix).toEqual(underlayMatrix(underlay, placer(drawing(axis), doc().sheets[0].viewports![0])));
    }
    expect(graphicOf('s1', 'z').underlays[0].matrix).not.toEqual(graphicOf('s1', 'y').underlays[0].matrix);
  });

  it('prints on the sheet that is chosen and on no other; at zero opacity on none', () => {
    expect(graphicOf('s2').underlays).toEqual([]);
    const hidden = { ...doc(), underlays: [{ ...underlay, opacity: 0 }] };
    expect(sheetGraphic(hidden.sheets[0], hidden, new Map([['v1', drawing('y')]])).underlays).toEqual([]);
  });

  it('the PDF draws the image at the sheet matrix, clipped to the viewport, and the unchosen page has none', async () => {
    const withIt = graphicOf('s1');
    const pdf = await exportPdf([withIt, graphicOf('s2')]);
    const matrices = placedMatrices(contents(pdf), withIt.paper.h);
    expect(matrices).toHaveLength(1);
    const want = withIt.underlays[0].matrix;
    matrices[0].forEach((n, i) => expect(n).toBeCloseTo(want[i], 2));
    expect(contents(pdf)).toMatch(/re\s+W\s+n\s+\/GS\d+ gs/);
    // One image object only: the second page, whose sheet is not chosen, draws none.
    expect(Buffer.from(pdf).toString('latin1').match(/\/Subtype\s*\/Image/g)).toHaveLength(1);
    const alone = await exportPdf([graphicOf('s2')]);
    expect(Buffer.from(alone).toString('latin1')).not.toMatch(/\/Subtype\s*\/Image/);
  });

  it('the DXF note names the views whose underlay it leaves out', () => {
    const d = doc();
    expect(omittedUnderlayViewNames(d.sheets[0], d.views, d.underlays)).toEqual(['Parter']);
    expect(omittedUnderlayViewNames(d.sheets[1], d.views, d.underlays)).toEqual([]);
  });

  it('the build says, per sheet, which views the DXF leaves out, and which underlays no sheet prints', () => {
    expect(underlayNotes(doc(), { dxf: true })).toEqual(['ifcsheet: the DXF of sheet S1 leaves out the underlay of Parter; the PDF prints it.']);
    expect(underlayNotes(doc(), { dxf: false })).toEqual([]);
    const stray = { ...doc(), underlays: [{ ...underlay, viewId: 'elsewhere' }] };
    expect(underlayNotes(stray, { dxf: false })[0]).toContain('"Plan scanat" is not printed');
  });

  it('the project file is read by the one reader: the same entries, a damaged one refused with its path', () => {
    const file = (underlays: unknown) => JSON.stringify({ format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, name: 'P', underlays });
    expect(readProjectFile(file([underlay])).underlays).toEqual([underlay]);
    expect(readProjectFile(file(undefined)).underlays).toBeUndefined();
    expect(() => readProjectFile(file([{ ...underlay, href: 'http://x/y.png' }]))).toThrow('/underlays/0/href');
    expect(readUnderlays({ underlays: [underlay] })).toEqual([underlay]);
  });
});
