/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A symbol on the sheet is printed as the app's `Symbol` draws it (#479): its shapes in the layer's colour, its texts in the text
 * style's weight, face and italic and in the symbol's own colour (the layer's, not the style's), and only what lies inside the
 * viewport's room (the sheet clips the viewport; the scale bar's tick figures past the room are not printed).
 */

import { describe, expect, it } from 'vitest';
import type { ProjectView, SheetViewport } from './document.js';
import type { TextStyle } from './draft-styles.js';
import type { DraftEntity, DraftLayer } from './draft-types.js';
import { viewportAnnotations, type SheetAnnotations } from './sheet-annotations.js';
import type { DraftSymbol } from './symbols.js';

const view = { id: 'v', name: 'Plan', kind: 'plan', createdAt: 0 } as ProjectView;
const vp = { id: 'vp', viewId: 'v', x: 100, y: 100, scale: 100 } as unknown as SheetViewport;
const layer: DraftLayer = { id: '0', name: '0', color: '#112233', visible: true, locked: false };
const loud: TextStyle = { id: 'loud', name: 'Loud', height: 2.5, font: 'serif', bold: true, italic: true, color: '#cc0000' };
/** A frame and two words, one 5 mm from the symbol's point and one 100 mm (10 m of drawing at 1:100) away. */
const bay: DraftSymbol = {
  id: 'project:bay', name: 'Bay', unit: 'paper',
  shapes: [
    { type: 'polyline', pts: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 0, y: 2 }], closed: true },
    { type: 'text', p: { x: 0, y: 0 }, text: 'NEAR', height: 2.5, rotation: 0 },
    { type: 'text', p: { x: 1000, y: 0 }, text: 'FAR', height: 2.5, rotation: 0 },
  ],
};
const instance = { id: 's', viewId: 'v', layerId: '0', shape: { type: 'symbol', symbolId: 'project:bay', p: { x: 0, y: 0 }, scale: 0.1, rotation: 0 }, params: { textStyle: 'loud' } } as unknown as DraftEntity;
const room = { x: 90, y: 90, w: 30, h: 30 };
const print = (box: typeof room | null) => viewportAnnotations(
  { view, vp, at: (p) => ({ x: 100 + p.x, y: 100 - p.y }), frame: { kx: 1, ky: -1 }, box },
  { drafts: [instance], layers: [layer], groups: [], book: { textStyles: [loud], dimStyles: [] }, symbols: [bay], locale: 'en' } as unknown as SheetAnnotations,
);

describe('a symbol on the sheet', () => {
  it('is printed: its shapes are strokes in the layer\'s colour', () => {
    const { strokes } = print(null);
    expect(strokes.length).toBeGreaterThan(0);
    expect(strokes.every((s) => s.colour === '#112233')).toBe(true);
    expect(strokes.some((s) => s.runs.length > 0)).toBe(true);
  });

  it('writes its text in the text style\'s weight, face and italic, in the symbol\'s own colour and not the style\'s', () => {
    const near = print(null).texts.find((t) => t.text === 'NEAR')!;
    expect({ bold: near.bold, face: near.face, colour: near.colour }).toEqual({ bold: true, face: { font: 'serif', italic: true }, colour: '#112233' });
  });

  it('prints the text inside the viewport\'s room and leaves out the one outside it', () => {
    expect(print(null).texts.map((t) => t.text).sort()).toEqual(['FAR', 'NEAR']);
    expect(print(room).texts.map((t) => t.text)).toEqual(['NEAR']);
  });
});
