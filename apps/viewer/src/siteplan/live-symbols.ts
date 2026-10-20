/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The built-in symbols whose content is not drawn by hand but computed from
 * the drawing they sit on and the model: the scale bar is laid out for the
 * scale the drawing is shown at, a north arrow marked `followsNorth` (the
 * site plan's own) turns to the model's true north, a coordinate point prints its map coordinates. The one code path
 * every renderer of a symbol instance goes through (`AnnotationGraphics`'s
 * symbol, on a sheet's viewport and on a drawing tab alike).
 */

import type { DraftSymbol, SymbolShape } from '@/catalogue/types';
import { findSymbol } from '@/drafting/symbols';
import type { Pt, SymbolInstanceShape } from '@/drafting/types';
import { scaleBarShapes } from './scale-bar';

export const SCALE_BAR_ID = 'builtin:scale-bar';
export const NORTH_ARROW_ID = 'builtin:north-arrow';
export const COORDINATE_POINT_ID = 'builtin:coordinate-point';

/** What a drawing tells its live symbols. */
export interface LiveSymbolContext {
  /** Scale denominator the drawing is shown at (a sheet viewport's own, else the view's). */
  scale: number;
  /** Rotation of true north on this drawing (`northArrowRotation`); `null`: the arrow keeps the rotation it was placed with. */
  north: number | null;
  /** The lines labelling a drawing point with its coordinates; `null`: none known. */
  coordinates: ((p: Pt) => string[]) | null;
  /** A scale bar label, metres. */
  format?: (metres: number) => string;
}

/** Coordinate label lettering, paper mm, and where its lines start beside the point. */
const LABEL_MM = 2;
const LABEL_AT = { x: 3, y: 1, step: 3 } as const;

/**
 * The definition and placement an instance is drawn with under `ctx`. Without
 * a context, or for any other symbol, the stored definition and placement.
 */
export function liveSymbol(
  shape: SymbolInstanceShape,
  ctx: LiveSymbolContext | null | undefined,
): { def: DraftSymbol | undefined; at: Pick<SymbolInstanceShape, 'p' | 'scale' | 'rotation'> } {
  const def = findSymbol(shape.symbolId);
  if (!ctx || !def) return { def, at: shape };
  switch (shape.symbolId) {
    case SCALE_BAR_ID:
      // Its ticks are metres of the drawing: a user scale on it would make the labels lie.
      return { def: { ...def, shapes: scaleBarShapes(ctx.scale, ctx.format) }, at: { ...shape, scale: 1 } };
    case NORTH_ARROW_ID:
      // Only an arrow marked to follow true north turns; one placed by hand keeps the rotation it was given.
      return ctx.north === null || !shape.followsNorth ? { def, at: shape } : { def, at: { ...shape, rotation: ctx.north } };
    case COORDINATE_POINT_ID: {
      const lines = ctx.coordinates?.(shape.p) ?? [];
      const texts: SymbolShape[] = lines.map((text, i) => ({
        // Stacked above and right of the point, the last line just above it.
        type: 'text', p: { x: LABEL_AT.x, y: LABEL_AT.y + (lines.length - 1 - i) * LABEL_AT.step }, text, height: LABEL_MM, rotation: 0,
      }));
      return { def: { ...def, shapes: [...def.shapes, ...texts] }, at: shape };
    }
    default:
      return { def, at: shape };
  }
}
