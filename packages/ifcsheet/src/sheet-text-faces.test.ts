/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the app's sheet does to text that `ifcsheet build` must do too (#479): a schedule's title, header and totals are bold and are set
 * in the project's "Tables" text style (#512), and a viewport's drafts are clipped to its box, texts included.
 */

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectView, SheetViewport } from './document.js';
import { tablesFace } from './draft-look.js';
import type { DraftEntity } from './draft-types.js';
import { exportPdf, pdfFont } from './export.js';
import { readProjectSet } from './project-set.js';
import { projectSheetOptions } from './project-sheets.js';
import type { OpenedModel } from './model.js';
import { scheduleGraphics } from './sheet-schedules.js';
import { viewportAnnotations, type SheetAnnotations } from './sheet-annotations.js';
import type { SheetGraphic } from './sheet-graphic.js';
import type { ScheduleLayout } from './schedule-prim.js';

// These tests pass no model: the site's north is not what they are about.
vi.mock('./site-frame.js', async (original) => ({ ...(await original<typeof import('./site-frame.js')>()), siteFrameOf: () => ({ frame: { north: null, frameOffset: undefined }, georeferenced: false }) }));

const layout: ScheduleLayout = {
  width: 60, height: 20,
  prims: [
    { kind: 'text', x: 2, y: 5, text: 'Walls', size: 3, anchor: 'start', bold: true },
    { kind: 'text', x: 2, y: 11, text: 'Brick', size: 2.5, anchor: 'start' },
  ],
};

describe('a schedule on the sheet keeps its bold and the Tables face', () => {
  it('bold prims print bold, the others do not', () => {
    const { texts } = scheduleGraphics(layout, { x: 100, y: 100 });
    expect(texts.map((t) => [t.text, t.bold === true])).toEqual([['Walls', true], ['Brick', false]]);
    expect(texts.every((t) => t.face === undefined)).toBe(true);
  });

  it('every text carries the face given', () => {
    const { texts } = scheduleGraphics(layout, { x: 100, y: 100 }, { font: 'serif', italic: true });
    expect(texts.map((t) => t.face)).toEqual([{ font: 'serif', italic: true }, { font: 'serif', italic: true }]);
  });

  it('the face is the project\'s "Tables" text style, and none without one', () => {
    const style = { id: 'tables', name: 'Tables', height: 2.5, font: 'mono' as const, bold: false, italic: true };
    expect(tablesFace([style])).toEqual({ font: 'mono', italic: true, styled: true });
    expect(tablesFace([])).toEqual({ font: 'sans', italic: false, styled: false });
    const options = (textStyles: unknown[]) => projectSheetOptions({ set: { ...readProjectSet({}), textStyles } as never, schedules: [] }, {} as OpenedModel, 'en', 'en', 'm.ifc');
    expect(options([style]).schedules?.face).toEqual({ font: 'mono', italic: true });
    expect(options([]).schedules).not.toHaveProperty('face');
  });
});

describe('the PDF sets bold and the Tables face', () => {
  it('picks the font of a text', () => {
    expect(pdfFont({ text: 'Walls', bold: true }, true)).toEqual(['Inter', 'bold']);
    expect(pdfFont({ text: 'Walls', bold: true }, false)).toEqual(['Inter', 'normal']);
    expect(pdfFont({ text: 'Walls' }, true)).toEqual(['Inter', 'normal']);
    expect(pdfFont({ text: 'Walls', bold: true, face: { font: 'serif', italic: false } }, true)).toEqual(['times', 'bold']);
    expect(pdfFont({ text: 'Walls', face: { font: 'mono', italic: false } }, true)).toEqual(['courier', 'normal']);
    expect(pdfFont({ text: 'Walls', face: { font: 'sans', italic: true } }, true)).toEqual(['helvetica', 'italic']);
    // ș is not in WinAnsi: the standard fonts cannot show it, so Inter does.
    expect(pdfFont({ text: 'Secțiuni', face: { font: 'serif', italic: false } }, true)).toEqual(['Inter', 'normal']);
  });

  it('writes the bold and the face into the file', async () => {
    const sheet = (texts: SheetGraphic['texts']): SheetGraphic => ({
      sheetId: 's', number: 'A-1', name: 'S', paper: { w: 297, h: 210 }, frame: [], fills: [], cut: [], lines: [], pens: [], marks: [], texts, images: [], underlays: [], viewports: [],
    });
    // The font each text is set in, as a reader sees it: its internal name and its family.
    const fonts = async (texts: SheetGraphic['texts']): Promise<Record<string, { name: string; family: string }>> => {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const require = createRequire(import.meta.url);
      const task = pdfjs.getDocument({ data: await exportPdf([sheet(texts)]), standardFontDataUrl: `${join(dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts')}/` });
      try {
        const content = await (await (await task.promise).getPage(1)).getTextContent();
        return Object.fromEntries(content.items.flatMap((i) => ('str' in i && i.str.trim() ? [[i.str, { name: i.fontName, family: content.styles[i.fontName].fontFamily }]] : [])));
      } finally {
        await task.destroy();
      }
    };
    const bold = await fonts([{ at: { x: 10, y: 10 }, text: 'Bold', size: 3, bold: true }, { at: { x: 10, y: 20 }, text: 'Plain', size: 3 }]);
    expect(bold.Bold.name).not.toBe(bold.Plain.name);
    const serif = await fonts([{ at: { x: 10, y: 10 }, text: 'Serif', size: 3, face: { font: 'serif', italic: false } }, { at: { x: 10, y: 20 }, text: 'Plain', size: 3 }]);
    expect(serif.Serif.family).toBe('serif');
    expect(serif.Plain.family).toBe('sans-serif');
  });
});

describe('a viewport clips its drafts\' texts', () => {
  const view = { id: 'v', name: 'Plan', kind: 'plan', createdAt: 0 } as ProjectView;
  const vp = { id: 'vp', viewId: 'v', x: 100, y: 100, scale: 100 } as unknown as SheetViewport;
  const note = (id: string, x: number): DraftEntity => ({ id, viewId: 'v', layerId: '0', shape: { type: 'text', p: { x, y: 0 }, text: id, height: 2.5, rotation: 0 }, params: {} }) as DraftEntity;
  const annotations = (drafts: DraftEntity[]): SheetAnnotations => ({
    drafts, layers: [{ id: '0', name: '0', color: '#000000', visible: true, locked: false }], groups: [], book: { textStyles: [], dimStyles: [] }, locale: 'en',
  } as unknown as SheetAnnotations);
  const drawn = (box: { x: number; y: number; w: number; h: number } | null) =>
    viewportAnnotations({ view, vp, at: (p) => ({ x: 100 + p.x, y: 100 - p.y }), frame: { kx: 1, ky: -1 }, box }, annotations([note('inside', 10), note('outside', 90)])).texts.map((t) => t.text);

  it('a text outside the box is not printed', () => {
    expect(drawn({ x: 80, y: 80, w: 60, h: 40 })).toEqual(['inside']);
  });

  it('a view with no box keeps them all', () => {
    expect(drawn(null).sort()).toEqual(['inside', 'outside']);
  });
});
