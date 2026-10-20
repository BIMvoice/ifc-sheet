/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Making a symbol out of drafted shapes: the inverse of placing one
 * (`drafting/symbols.ts`). Shapes are taken relative to the insertion point,
 * with the symbol's +y pointing up on the screen, and in the symbol's unit
 * (paper millimetres, or metres). Only lines, polylines, circles, arcs and
 * text can go into a symbol; anything else is counted as left out.
 */

import type { SymbolShape } from '@/catalogue/types';
import type { EntityShape, Pt } from '@/drafting/types';

/** A point with its y taken to the other side when the drawing's y runs down the screen. */
const mirrorY = (p: Pt, up: 1 | -1): Pt => ({ x: p.x, y: p.y * up });

export interface BuiltShapes {
  shapes: SymbolShape[];
  /** How many of the given shapes could not go into a symbol. */
  skipped: number;
}

/**
 * `shapes` (drawing space) as symbol shapes about `origin`. `up` is the
 * drawing-y direction of screen-up, `unitSize` the drawing units per symbol
 * unit (the paper unit of the view for a paper symbol, 1 for a model one).
 */
export function buildSymbolShapes(shapes: readonly EntityShape[], origin: Pt, up: 1 | -1, unitSize: number): BuiltShapes {
  const map = (p: Pt): Pt => mirrorY({ x: (p.x - origin.x) / unitSize, y: (p.y - origin.y) / unitSize }, up);
  const out: SymbolShape[] = [];
  let skipped = 0;
  for (const s of shapes) {
    switch (s.type) {
      case 'line': out.push({ type: 'line', a: map(s.a), b: map(s.b) }); break;
      case 'polyline': out.push({ type: 'polyline', pts: s.pts.map(map), closed: s.closed }); break;
      case 'circle': out.push({ type: 'circle', c: map(s.c), r: s.r / unitSize }); break;
      case 'arc':
        out.push(up === 1
          ? { type: 'arc', c: map(s.c), r: s.r / unitSize, start: s.start, end: s.end }
          : { type: 'arc', c: map(s.c), r: s.r / unitSize, start: -s.end, end: -s.start });
        break;
      case 'text': out.push({ type: 'text', p: map(s.p), text: s.text, height: s.height / unitSize, rotation: s.rotation * up }); break;
      default: skipped++;
    }
  }
  return { shapes: out, skipped };
}
