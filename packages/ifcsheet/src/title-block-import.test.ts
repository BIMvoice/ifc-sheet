/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * An office's own title block (#458): a DXF (and an SVG) imported as a layout, four fields placed on it, printed on every
 * sheet of a set with the fields filled, and kept through the project file, the PDF and the DXF.
 */

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProjectDocument, ProjectSheet } from './document.js';
import { exportDxf, exportPdf } from './export.js';
import { importTitleBlockDxf, importTitleBlockSvg, ownTitleBlockPack, placeField, placedFields, TitleBlockImportError } from './title-block-import.js';
import { readProjectFile } from './project-read.js';
import { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION } from './project-version.js';
import { sheetGraphic } from './sheet-graphic.js';
import { readTitleBlockTemplate } from './title-block-template-read.js';

const dxf = (pairs: Array<[number, string | number]>): string => pairs.map(([c, v]) => `${c}\n${v}`).join('\n') + '\n';
const header = (insunits: number | null): Array<[number, string | number]> => insunits === null ? [] : [[0, 'SECTION'], [2, 'HEADER'], [9, '$INSUNITS'], [70, insunits], [0, 'ENDSEC']];
const line = (x1: number, y1: number, x2: number, y2: number): Array<[number, string | number]> => [[0, 'LINE'], [8, '0'], [10, x1], [20, y1], [30, 0], [11, x2], [21, y2], [31, 0]];
const text = (x: number, y: number, h: number, s: string): Array<[number, string | number]> => [[0, 'TEXT'], [8, '0'], [10, x], [20, y], [30, 0], [40, h], [1, s]];
const rect = (x: number, y: number, w: number, h: number): Array<[number, string | number]> => [[0, 'LWPOLYLINE'], [8, '0'], [90, 4], [70, 1], [10, x], [20, y], [10, x + w], [20, y], [10, x + w], [20, y + h], [10, x], [20, y + h]];

/** An office block, 180 x 50 mm in a DXF in `unit` times the millimetre: an outline, a 2 x 3 grid of cells and the fixed captions. */
function officeDxf(k = 1, insunits: number | null = 4): string {
  const s = (v: number): number => v * k;
  return dxf([
    ...header(insunits), [0, 'SECTION'], [2, 'ENTITIES'],
    ...rect(0, 0, s(180), s(50)),
    ...line(s(0), s(25), s(180), s(25)), ...line(s(60), s(0), s(60), s(50)), ...line(s(120), s(0), s(120), s(25)),
    ...text(s(2), s(21), s(2), 'PROJECT'), ...text(s(62), s(21), s(2), 'SHEET'), ...text(s(2), s(46), s(2), 'DRAWN BY'), ...text(s(122), s(46), s(2), 'DATE'),
    [0, 'ENDSEC'], [0, 'EOF'],
  ]);
}

const FOUR: Array<[string, number, number]> = [['Project', 3, 12], ['SheetNumber', 63, 12], ['DrawnBy', 3, 37], ['Date', 123, 37]];
const withFields = (t: ReturnType<typeof importTitleBlockDxf>['template']) => FOUR.reduce((acc, [f, x, y]) => placeField(acc, f, { x, y }, { fit: 50 }), t);

const sheet = (id: string, number: string, over: Partial<ProjectSheet> = {}): ProjectSheet => ({ id, number, name: `Plan ${number}`, createdAt: 0, paper: 'A3', orientation: 'landscape', viewports: [], ...over });
const set = (template: ProjectDocument['titleBlockTemplate']): ProjectDocument => ({
  name: 'Demo', models: [], views: [], titleBlock: { project: 'Casa Demo', date: '2026-10-27', drawnBy: 'PC' }, titleBlockTemplate: template,
  sheets: [sheet('s1', 'A-101'), sheet('s2', 'A-102', { paper: 'A1' }), sheet('s3', 'A-103', { paper: 'A4', orientation: 'portrait' }), sheet('s4', 'A-104', { frame: { margins: { top: 10, right: 10, bottom: 10, left: 10 }, titleBlock: 'right' } })],
});

describe('a DXF title block', () => {
  it('becomes lines, a boxed outline and fixed text at true size, top-left on the block, y turned down', () => {
    const r = importTitleBlockDxf(officeDxf());
    expect(r.shrunkBy).toBe(1);
    expect(r.size).toEqual({ w: 180, h: 50 });
    const lines = r.template.items.filter((i) => i.kind === 'line');
    expect(lines.some((i) => i.kind === 'line' && i.x1 === 0 && i.x2 === 180 && i.y1 === 25 && i.y2 === 25)).toBe(true);
    // The caption written at DXF y = 21 (above the middle) sits above the middle line on the block too.
    const caption = r.template.items.find((i) => i.kind === 'text' && i.text === 'PROJECT');
    expect(caption).toMatchObject({ x: 2, y: 29, size: 2 });
    // The outline's four sides, each once.
    expect(lines.filter((i) => i.kind === 'line' && i.y1 === i.y2 && i.y1 === 0)).toHaveLength(1);
  });

  it('reads its units from $INSUNITS: the same block in metres is the same layout', () => {
    expect(importTitleBlockDxf(officeDxf(0.001, 6)).template).toEqual(importTitleBlockDxf(officeDxf()).template);
  });

  it('a file without $INSUNITS is read as millimetres and says so; a block larger than the area is shrunk and says so', () => {
    const none = importTitleBlockDxf(officeDxf(1, null));
    expect(none.template).toEqual(importTitleBlockDxf(officeDxf()).template);
    expect(none.notes.join(' ')).toMatch(/no \$INSUNITS/);
    const big = importTitleBlockDxf(officeDxf(2));
    expect(big.shrunkBy).toBe(0.5);
    expect(big.size).toEqual({ w: 180, h: 50 });
    expect(big.notes.join(' ')).toMatch(/shrunk to 50 %/);
  });

  it('refuses a file with nothing in it, and a drawing with more shapes than a layout holds', () => {
    expect(() => importTitleBlockDxf(dxf([[0, 'SECTION'], [2, 'ENTITIES'], [0, 'ENDSEC'], [0, 'EOF']]))).toThrow(TitleBlockImportError);
    const many = dxf([[0, 'SECTION'], [2, 'ENTITIES'], ...Array.from({ length: 501 }, (_, i) => line(i / 10, 0, i / 10, 5)).flat(), [0, 'ENDSEC'], [0, 'EOF']]);
    expect(() => importTitleBlockDxf(many)).toThrow(/holds 500/);
  });

  it('keeps braces out of fixed text so a caption cannot turn into a field', () => {
    const r = importTitleBlockDxf(dxf([...header(4), [0, 'SECTION'], [2, 'ENTITIES'], ...rect(0, 0, 100, 40), ...text(2, 5, 2, '{Project}'), [0, 'ENDSEC'], [0, 'EOF']]));
    expect(placedFields(r.template)).toEqual([]);
  });
});

describe('fields on the imported block', () => {
  it('only the names the built-in block fills can be placed', () => {
    const t = importTitleBlockDxf(officeDxf()).template;
    expect(() => placeField(t, 'Nonsense', { x: 1, y: 1 })).toThrow(/not a title block field/);
    expect(() => placeField(t, 'Project', { x: Number.NaN, y: 1 })).toThrow(TitleBlockImportError);
    expect(placedFields(withFields(t))).toEqual(['Project', 'SheetNumber', 'DrawnBy', 'Date']);
  });
});

describe('a project that keeps the imported block', () => {
  const template = withFields(importTitleBlockDxf(officeDxf()).template);
  const doc = set(template);

  it('prints it on every sheet of the set with the four fields filled, the fixed text beside them', () => {
    for (const s of doc.sheets) {
      const g = sheetGraphic(s, doc, new Map());
      const shown = g.texts.map((t) => t.text);
      expect(shown, s.number).toEqual(expect.arrayContaining(['PROJECT', 'SHEET', 'DRAWN BY', 'DATE', 'Casa Demo', s.number, 'PC']));
      expect(shown.some((x) => /2026/.test(x)), s.number).toBe(true);
      expect(shown, s.number).not.toContain('{Project}');
      // The standard block's own captions are not there: the office's replaced it.
      expect(shown, s.number).not.toContain('Scale');
    }
  });

  it('survives save and reopen: the project file carries it and the engine reads it back equal', () => {
    const file = JSON.stringify({ format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, name: doc.name, titleBlockTemplate: doc.titleBlockTemplate });
    expect(readProjectFile(file).titleBlockTemplate).toEqual(template);
    expect(readTitleBlockTemplate(JSON.parse(JSON.stringify(template)))).toEqual(template);
  });

  it('reaches the PDF and the DXF', async () => {
    const graphics = doc.sheets.map((s) => sheetGraphic(s, doc, new Map()));
    const bytes = await exportPdf(graphics);
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = pdfjs.getDocument({ data: bytes.slice(), standardFontDataUrl: `${join(dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json')), 'standard_fonts')}/` });
    const pdf = await task.promise;
    try {
      expect(pdf.numPages).toBe(doc.sheets.length);
      for (let n = 1; n <= pdf.numPages; n++) {
        const content = await (await pdf.getPage(n)).getTextContent();
        const shown = content.items.map((i) => ('str' in i ? i.str : '')).join(' ');
        for (const word of ['PROJECT', 'DRAWN BY', 'Casa Demo', doc.sheets[n - 1].number, 'PC']) expect(shown, `page ${n}`).toContain(word);
      }
    } finally {
      await task.destroy();
    }
    // The DXF carries the sheet's line work (its texts are the PDF's): every point of the block's lines is in it, y turned up.
    const standard = doc.sheets.map((s) => exportDxf(sheetGraphic(s, set(undefined), new Map())));
    graphics.forEach((g, i) => {
      const out = exportDxf(g);
      for (const poly of g.frame) for (const p of poly) {
        expect(out, `${g.number} x`).toContain(p.x.toFixed(6));
        expect(out, `${g.number} y`).toContain((g.paper.h - p.y).toFixed(6));
      }
      expect(out).not.toBe(standard[i]);
    });
  });

  it('is a library item a standards pack carries, with the title block alone', () => {
    const pack = ownTitleBlockPack(template, 'Birou Ionescu');
    expect(pack.id).toBe('title-block-birou-ionescu');
    expect(pack.titleBlockTemplate).toEqual(template);
    expect(pack.graphicStandard).toBeUndefined();
  });
});

describe('an SVG title block', () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="180mm" height="50mm" viewBox="0 0 360 100">
    <rect x="0" y="0" width="360" height="100" stroke-width="1"/>
    <line x1="0" y1="50" x2="360" y2="50"/>
    <path d="M120 0 V50 M0 0 h10 v10 z"/>
    <polyline points="240,50 240,100"/>
    <text x="4" y="40" font-size="4">PROJECT &amp; CLIENT</text>
    <text x="356" y="90" font-size="4" text-anchor="end"><tspan>DATE</tspan></text>
  </svg>`;

  it('takes its scale from the viewBox and width, y down as the block has it', () => {
    const r = importTitleBlockSvg(svg);
    expect(r.size).toEqual({ w: 180, h: 50 });
    expect(r.template.items.find((i) => i.kind === 'text' && i.text === 'PROJECT & CLIENT')).toMatchObject({ x: 2, y: 20, size: 2 });
    expect(r.template.items.some((i) => i.kind === 'line' && i.x1 === 60 && i.y1 === 0 && i.x2 === 60 && i.y2 === 25)).toBe(true);
    const date = r.template.items.find((i) => i.kind === 'text' && i.text === 'DATE');
    expect(date && date.kind === 'text' && date.x).toBeLessThan(178);
    expect(placedFields(withFieldsSvg(r.template))).toEqual(['Project', 'SheetNumber', 'DrawnBy', 'Date']);
  });

  it('says what it does not read: CSS, transforms, curves, a size it cannot take', () => {
    const r = importTitleBlockSvg('<svg viewBox="0 0 100 40"><style>.a{}</style><g transform="scale(2)"><path d="M0 0 C 10 10 20 20 50 0"/></g><text x="1" y="5" transform="rotate(90)">X</text></svg>');
    const notes = r.notes.join(' ');
    for (const word of ['CSS', 'transform', 'curves', 'one millimetre', 'rotated']) expect(notes).toContain(word);
  });

  it('refuses a file that is not an SVG', () => {
    expect(() => importTitleBlockSvg('hello')).toThrow(TitleBlockImportError);
  });
});

const withFieldsSvg = withFields;
