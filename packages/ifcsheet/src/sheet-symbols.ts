/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A symbol instance on the paper (#479), drawn as the app's sheet draws it (`AnnotationGraphics.tsx`, `Symbol`): the definition's
 * shapes (the project's own symbol, else a built-in one; the scale bar, north arrow and coordinate point as `liveSymbol` makes them
 * for this viewport) at the instance's place, scale and rotation, in the layer's colour at the sheet's pen, its texts in the text style (weight, face, italic) and the symbol's own colour, not the style's, as the app's `Symbol` draws them; a symbol whose
 * definition is gone stands as the dashed cross the sheet draws.
 */

import type { Point2D } from '@ifc-lite/drawing-2d';
import type { SectionAxisName } from './drawing-frame.js';
import type { SymbolInstanceShape } from './draft-types.js';
import { liveSymbol, type LiveSymbolContext } from './live-symbols.js';
import { label, readableAngle, textInk } from './sheet-stroke.js';
import { K, type MarkContext } from './sheet-marks.js';
import { flattenShape, missingSymbolMark, placeSymbol, type DraftSymbol } from './symbols.js';

/** What a symbol is drawn with beyond the mark's context: the project's own symbols and what the viewport tells the live ones. */
export interface SymbolContext {
  own: readonly DraftSymbol[];
  live: LiveSymbolContext | null;
  /** The cut axis of the view (a plan is `down`: its drawing y runs down the screen). */
  axis: SectionAxisName;
}

/** The symbol's shapes as strokes and its texts as labels. */
export function drawSymbol(shape: SymbolInstanceShape, c: MarkContext, s: SymbolContext): void {
  const { def, at } = liveSymbol(shape, s.live, s.own);
  const placed = def ? placeSymbol(def, at, s.axis === 'down' ? -1 : 1) : null;
  const geometry = placed ? placed.geometry : missingSymbolMark(shape);
  const runs = geometry.flatMap((g) => {
    const f = flattenShape(g);
    const pts: Point2D[] = f.pts.map(c.at);
    return c.clip(f.closed ? [...pts, pts[0]] : pts);
  });
  c.out.strokes.push({ colour: c.colour, width: K, ...(def ? {} : { dash: [3 * K, 2 * K] }), runs });
  for (const x of placed?.texts ?? []) {
    const px = Math.max(x.height * c.mmPerMetre, 1);
    c.out.texts.push(label(c.at(x.p), x.text, px, readableAngle(x.rotation, c.frame), 0, 'left', textInk(c.look.text, c.colour)));
  }
}
