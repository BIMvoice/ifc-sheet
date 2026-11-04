/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A solid fill that masks what is behind it (#681). Before, every solid hatch was drawn at 0.85 opacity, so a roof line showed
 * through a circle filled to hide it. A masking fill is opaque on the sheet and in the PDF (the same stroke the PDF fills), keeps its
 * colour through the project file, and a solid hatch saved without the flag still draws as it did.
 */

import { describe, expect, it } from 'vitest';
import type { ProjectView, SheetViewport } from './document.js';
import type { DraftEntity } from './draft-types.js';
import { readShape } from './draft-read.js';
import { fillColourOf, fillLoopsOf, maskingFill } from './fill-mask.js';
import { viewportAnnotations, type SheetAnnotations } from './sheet-annotations.js';

const square = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];

describe('fillLoopsOf', () => {
  it('takes the loop of a closed polyline and of a circle, and nothing of an open shape', () => {
    expect(fillLoopsOf({ type: 'polyline', pts: square, closed: true })).toEqual([square]);
    expect(fillLoopsOf({ type: 'circle', c: { x: 1, y: 1 }, r: 2 })?.[0]).toHaveLength(64);
    expect(fillLoopsOf({ type: 'polyline', pts: square, closed: false })).toBeNull();
    expect(fillLoopsOf({ type: 'line', a: square[0], b: square[1] })).toBeNull();
  });
});

describe('fillColourOf', () => {
  it('is white when nothing is typed, and reads a name, #rgb and #rrggbb', () => {
    expect(fillColourOf('')).toBe('#ffffff');
    expect(fillColourOf(' Red ')).toBe('#ff0000');
    expect(fillColourOf('#0af')).toBe('#00aaff');
    expect(fillColourOf('#00AAFF')).toBe('#00aaff');
    expect(fillColourOf('mauve')).toBeNull();
  });
});

describe('a masking fill in the file', () => {
  it('is read back with its colour and its opaque flag', () => {
    const shape = maskingFill([square], '#ff0000');
    expect(readShape(JSON.parse(JSON.stringify(shape)), 'h')).toEqual(shape);
  });

  it('is absent from a solid hatch saved before it existed', () => {
    const old = { type: 'hatch', loops: [square], pattern: 'SOLID', scale: 1, angle: 0 };
    expect(readShape(old, 'h')).toEqual(old);
  });
});

describe('the sheet and the PDF', () => {
  const view = { id: 'v', name: 'Plan', kind: 'plan', createdAt: 0 } as ProjectView;
  const vp = { id: 'vp', viewId: 'v', x: 100, y: 100, scale: 100 } as unknown as SheetViewport;
  const fillStroke = (shape: DraftEntity['shape']) => viewportAnnotations(
    { view, vp, at: (p) => ({ x: 100 + p.x, y: 100 - p.y }), frame: { kx: 1, ky: -1 }, box: null },
    { drafts: [{ id: 'h', viewId: 'v', layerId: '0', shape, params: {} }], layers: [{ id: '0', name: '0', color: '#112233', visible: true, locked: false }], groups: [], book: { textStyles: [], dimStyles: [] }, locale: 'en' } as unknown as SheetAnnotations,
  ).strokes.find((s) => s.fill);

  it('draws a masking fill fully opaque, in its own colour', () => {
    const s = fillStroke(maskingFill([square], '#ffffff'));
    expect(s?.opacity).toBe(1);
    expect(s?.colour).toBe('#ffffff');
  });

  it('draws a solid hatch without the flag at 0.85 in the layer colour, as before', () => {
    const s = fillStroke({ type: 'hatch', loops: [square], pattern: 'SOLID', scale: 1, angle: 0 });
    expect(s?.opacity).toBe(0.85);
    expect(s?.colour).toBe('#112233');
  });
});
