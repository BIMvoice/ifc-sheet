/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A drafted text prints in its text style, as the app's sheet draws it (#479): `Label` sets the style's weight, face and italic,
 * and fills it with the style's colour, else the layer's (a dimension's label: the style's, else the dimension style's, else the layer's).
 */

import { describe, expect, it } from 'vitest';
import type { ProjectView, SheetViewport } from './document.js';
import type { DimStyle, TextStyle } from './draft-styles.js';
import type { DraftEntity, DraftLayer } from './draft-types.js';
import { exportPdf } from './export.js';
import { viewportAnnotations, type SheetAnnotations } from './sheet-annotations.js';
import type { SheetGraphic, SheetText } from './sheet-graphic.js';

const view = { id: 'v', name: 'Plan', kind: 'plan', createdAt: 0 } as ProjectView;
const vp = { id: 'vp', viewId: 'v', x: 100, y: 100, scale: 100 } as unknown as SheetViewport;
const layer: DraftLayer = { id: '0', name: '0', color: '#112233', visible: true, locked: false };
const loud: TextStyle = { id: 'loud', name: 'Loud', height: 2.5, font: 'serif', bold: true, italic: true, color: '#cc0000' };
const quiet: TextStyle = { id: 'quiet', name: 'Quiet', height: 2.5, font: 'sans', bold: false, italic: false };
const entity = (id: string, shape: object, params: DraftEntity['params']): DraftEntity => ({ id, viewId: 'v', layerId: '0', shape, params }) as DraftEntity;
const texts = (drafts: DraftEntity[], dimStyles: DimStyle[] = []): SheetText[] =>
  viewportAnnotations(
    { view, vp, at: (p) => ({ x: 100 + p.x, y: 100 - p.y }), frame: { kx: 1, ky: -1 }, box: null },
    { drafts, layers: [layer], groups: [], book: { textStyles: [loud, quiet], dimStyles }, locale: 'en' } as unknown as SheetAnnotations,
  ).texts;
const ink = (t: SheetText) => ({ bold: t.bold, face: t.face, colour: t.colour });

describe('a drafted text on the sheet keeps its text style', () => {
  it('a text in a bold, italic, serif, red style prints so', () => {
    const [t] = texts([entity('t', { type: 'text', p: { x: 0, y: 0 }, text: 'Note', height: 2.5, rotation: 0 }, { textStyle: 'loud' })]);
    expect(ink(t)).toEqual({ bold: true, face: { font: 'serif', italic: true }, colour: '#cc0000' });
  });

  it('a text whose style has no colour takes its layer\'s, in the plain face', () => {
    const [t] = texts([entity('t', { type: 'text', p: { x: 0, y: 0 }, text: 'Note', height: 2.5, rotation: 0 }, { textStyle: 'quiet' })]);
    expect(ink(t)).toEqual({ bold: undefined, face: undefined, colour: '#112233' });
  });

  it('the element\'s own overrides win over its style', () => {
    const [t] = texts([entity('t', { type: 'text', p: { x: 0, y: 0 }, text: 'Note', height: 2.5, rotation: 0 }, { textStyle: 'quiet', 'o.bold': true, 'o.color': '#00aa00' })]);
    expect(ink(t)).toEqual({ bold: true, face: undefined, colour: '#00aa00' });
  });

  it('a leader\'s and a level mark\'s texts are in the style too', () => {
    const out = texts([
      entity('l', { type: 'leader', pts: [{ x: 0, y: 0 }, { x: 5, y: 5 }], text: 'Leader', height: 2.5 }, { textStyle: 'loud' }),
      entity('m', { type: 'level', p: { x: 0, y: 0 }, value: 1.2, height: 2.5 }, { textStyle: 'loud' }),
    ]);
    expect(out.map(ink)).toEqual([0, 1].map(() => ({ bold: true, face: { font: 'serif', italic: true }, colour: '#cc0000' })));
  });

  it('a symbol\'s text is in the style, coloured as the symbol\'s lines (the layer\'s), not the style\'s', () => {
    const [t] = texts([entity('s', { type: 'symbol', symbolId: 'builtin:tag-bubble', p: { x: 0, y: 0 }, scale: 1, rotation: 0 }, { textStyle: 'loud' })]);
    expect(ink(t)).toEqual({ bold: true, face: { font: 'serif', italic: true }, colour: '#112233' });
  });

  it('a dimension\'s label takes the dimension style\'s colour when its text style has none', () => {
    const dim = { id: 'd', name: 'D', textStyle: 'quiet', arrow: 'tick', arrowSize: 2, extGap: 1, extOver: 1, placement: 'above', textGap: 1, precision: 0, unit: 'mm', color: '#0000ff' } as unknown as DimStyle;
    const [t] = texts([entity('d', { type: 'dimension', a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, at: { x: 0, y: 1 }, variant: 'aligned', height: 2.5 }, { dimStyle: 'd' })], [dim]);
    expect(t.colour).toBe('#0000ff');
  });
});

describe('the PDF writes a text\'s colour', () => {
  it('fills each text with its own colour, black when it has none', async () => {
    const sheet: SheetGraphic = {
      sheetId: 's', number: 'A-1', name: 'S', paper: { w: 297, h: 210 }, frame: [], fills: [], cut: [], lines: [], pens: [], marks: [], images: [], underlays: [], viewports: [],
      texts: [{ at: { x: 10, y: 10 }, text: 'Red', size: 3, colour: '#cc0000' }, { at: { x: 10, y: 20 }, text: 'Black', size: 3 }],
    };
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = pdfjs.getDocument({ data: await exportPdf([sheet]) });
    try {
      const ops = await (await (await task.promise).getPage(1)).getOperatorList();
      // The fill colour in force at each text drawn.
      let fill = '';
      const shown: string[] = [];
      ops.fnArray.forEach((fn, i) => {
        if (fn === pdfjs.OPS.setFillRGBColor) fill = String(ops.argsArray[i][0]);
        if (fn === pdfjs.OPS.showText) shown.push(fill);
      });
      expect(shown).toEqual(['#cc0000', '#000000']);
    } finally {
      await task.destroy();
    }
  });
});
