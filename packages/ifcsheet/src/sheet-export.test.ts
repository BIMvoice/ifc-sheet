/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The headless sheet layout and its writers on a drawing whose every point is
 * known (#163 review): where a drawing point lands on the paper (centred,
 * at the viewport's scale, y up turned to y down), that a drawing stays in its
 * viewport's box, that the title block carries the sheet's number and name,
 * that each PDF page is its sheet's paper and holds the text (Romanian
 * included), and that the DXF has the same points with y up again.
 */

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import DxfParserModule from 'dxf-parser';
import type { DxfParser as DxfParserInstance, IPolylineEntity } from 'dxf-parser';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { describe, expect, it } from 'vitest';
import { clipPolyline } from './clip.js';
import type { ProjectDocument, ProjectSheet } from './document.js';
import { exportDxf, exportPdf } from './export.js';
import { sheetGraphic, type SheetGraphic } from './sheet-graphic.js';

const DxfParser = DxfParserModule as unknown as new () => DxfParserInstance;

/** A 10 × 4 m drawing, cut along `axis` (an elevation by default): one diagonal line corner to corner, one hidden line, one 1 m cut square. */
const drawing = (axis: 'x' | 'y' | 'z' = 'z'): Drawing2D => ({
  config: { plane: { axis, position: 0, flipped: false }, projectionDepth: 0, includeHiddenLines: false, creaseAngle: 30, scale: 50 },
  lines: [
    { line: { start: { x: 0, y: 0 }, end: { x: 10, y: 4 } }, category: 'projection', visibility: 'visible', entityId: 1, ifcType: 'IfcWall', modelIndex: 0, depth: 0 },
    { line: { start: { x: 0, y: 4 }, end: { x: 10, y: 0 } }, category: 'hidden', visibility: 'hidden', entityId: 2, ifcType: 'IfcWall', modelIndex: 0, depth: 0 },
  ],
  cutPolygons: [{ polygon: { outer: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 }], holes: [] }, entityId: 3, ifcType: 'IfcColumn', modelIndex: 0, isCut: true }],
  projectionPolygons: [],
  bounds: { min: { x: 0, y: 0 }, max: { x: 10, y: 4 } },
  stats: { cutLineCount: 0, projectionLineCount: 1, hiddenLineCount: 1, silhouetteLineCount: 0, polygonCount: 1, totalTriangles: 0, processingTimeMs: 0 },
});

const sheet = (over: Partial<ProjectSheet> = {}): ProjectSheet => ({
  id: 's1', number: 'A-101', name: 'Secțiuni și fațade', createdAt: 0, paper: 'A3', orientation: 'landscape',
  viewports: [{ id: 'vp', viewId: 'v1', x: 200, y: 150, scale: 50, width: 0, height: 0, center: null }],
  ...over,
});

const doc = (sheets: ProjectSheet[]): ProjectDocument => ({
  name: 'Casă', models: [], sheets, titleBlock: { project: 'Locuință ș ț', date: '2026-10-21' },
  views: [{ id: 'v1', kind: 'plan', name: 'Parter', createdAt: 0, cutHeight: 1.2, level: { name: 'Parter', elevation: 0, storeyGlobalIds: [] } }],
});

const graphic = (s = sheet()): SheetGraphic => sheetGraphic(s, doc([s]), new Map([['v1', drawing()]]));

describe('a sheet laid out as shapes', () => {
  it('puts a drawing point where its scale and the viewport say, y up turned to y down', () => {
    // 1:50 is 20 mm a metre; the drawing's centre (5, 2) sits on the viewport's (200, 150).
    expect(graphic().lines).toEqual([[{ x: 100, y: 190 }, { x: 300, y: 110 }]]);
  });

  it('a plan keeps its second axis pointing down the paper, an east elevation mirrors its first (the sheet in the app does the same, #279)', () => {
    const lines = (axis: 'x' | 'y' | 'z') => sheetGraphic(sheet(), doc([sheet()]), new Map([['v1', drawing(axis)]])).lines;
    expect(lines('y')).toEqual([[{ x: 100, y: 110 }, { x: 300, y: 190 }]]);
    expect(lines('x')).toEqual([[{ x: 300, y: 190 }, { x: 100, y: 110 }]]);
  });

  it('closes a cut ring and leaves hidden lines out', () => {
    expect(graphic().cut).toEqual([[{ x: 120, y: 170 }, { x: 140, y: 170 }, { x: 140, y: 150 }, { x: 120, y: 150 }, { x: 120, y: 170 }]]);
  });

  it('keeps a drawing inside the box the layout made for its view', () => {
    // A building 4 × 2 m: a box 80 × 40 mm round (200, 150); the 10 × 4 m drawing is clipped to it.
    const g = sheetGraphic(sheet(), doc([sheet()]), new Map([['v1', drawing()]]), { min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 3, z: 2 } });
    expect(g.viewports).toEqual([{ viewId: 'v1', box: { x: 160, y: 130, w: 80, h: 40 } }]);
    for (const pts of [...g.lines, ...g.cut]) for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(160 - 1e-9);
      expect(p.x).toBeLessThanOrEqual(240 + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(130 - 1e-9);
      expect(p.y).toBeLessThanOrEqual(170 + 1e-9);
    }
    expect(g.lines.length).toBe(1);
  });

  it('prints the sheet number and name, the project and the scale in the title block', () => {
    const texts = graphic().texts.map((t) => t.text);
    expect(texts).toEqual(expect.arrayContaining(['A-101', 'Secțiuni și fațade', 'Locuință ș ț', '1:50   2026-10-21', 'Parter  1:50']));
  });
});

describe('clipping a run of points', () => {
  it('splits a run where it leaves the box and keeps what is inside', () => {
    const box = { x: 0, y: 0, w: 10, h: 10 };
    expect(clipPolyline([{ x: -5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 15 }], box)).toEqual([[{ x: 0, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 10 }]]);
    expect(clipPolyline([{ x: 20, y: 20 }, { x: 30, y: 30 }], box)).toEqual([]);
  });
});

async function openPdf(bytes: Uint8Array) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const require = createRequire(import.meta.url);
  const task = pdfjs.getDocument({ data: bytes.slice(), standardFontDataUrl: `${join(dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts')}/` });
  return { pdf: await task.promise, close: () => task.destroy() };
}

const PT_MM = 25.4 / 72;

describe('the PDF', () => {
  it('makes each page its sheet\'s paper, and writes the text in a font that has ș and ț', async () => {
    const a3 = graphic();
    const a1 = graphic(sheet({ id: 's2', number: 'A-102', paper: 'A1', orientation: 'portrait' }));
    const { pdf, close } = await openPdf(await exportPdf([a3, a1]));
    try {
      expect(pdf.numPages).toBe(2);
      const sizes = [];
      const texts: string[] = [];
      for (let n = 1; n <= pdf.numPages; n++) {
        const page = await pdf.getPage(n);
        sizes.push(page.view.slice(2).map((v) => Math.round(v * PT_MM)));
        const content = await page.getTextContent();
        texts.push(content.items.map((i) => ('str' in i ? i.str : '')).join(' '));
      }
      expect(sizes).toEqual([[420, 297], [594, 841]]);
      expect(texts[0]).toContain('A-101');
      expect(texts[1]).toContain('A-102');
      expect(texts[0]).toContain('Secțiuni și fațade');
      expect(texts[0]).toContain('Locuință ș ț');
    } finally {
      await close();
    }
  });
});

describe('the DXF', () => {
  it('writes the same points in paper millimetres with y up from the paper\'s bottom edge', () => {
    const parsed = new DxfParser().parseSync(exportDxf(graphic()));
    const lines = (parsed?.entities ?? []).filter((e): e is IPolylineEntity => e.layer === 'VIEW-SEEN-025');
    // The paper is 297 mm high: y 190 from the top is 107 from the bottom.
    expect(lines.map((e) => e.vertices.map((v) => [v.x, v.y]))).toEqual([[[100, 107], [300, 187]]]);
  });

  it('carries the app\'s pens (#34): the line seen beyond on the seen pen, the hidden line on the hidden pen, a category colour in its layer', () => {
    const layers = (g: SheetGraphic) => Object.keys(new DxfParser().parseSync(exportDxf(g))?.tables.layer.layers ?? {});
    expect(layers(graphic())).toEqual(expect.arrayContaining(['VIEW-SEEN-025', 'VIEW-HIDDEN-018']));
    const s = sheet();
    const red = sheetGraphic(s, { ...doc([s]), views: doc([s]).views.map((v) => ({ ...v, graphics: { categories: { walls: { lineColor: '#cc0000', lineWeight: 'heavy' } } } })) }, new Map([['v1', drawing()]]));
    expect(red.pens.find((p) => p.layer === 'SEEN')).toMatchObject({ stroke: '#cc0000', width: 0.35 });
    expect(red.pens.find((p) => p.layer === 'HIDDEN')).toMatchObject({ stroke: '#cc0000', width: 0.18, dash: [1.5, 1] });
    expect(red.pens.find((p) => p.layer === 'FILL')).toMatchObject({ fill: '#d4d4d8' });
    expect(layers(red)).toEqual(expect.arrayContaining(['VIEW-SEEN-035-CC0000', 'VIEW-HIDDEN-018-CC0000']));
  });
});
