/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A closed drafted shape made a masking fill (#681): the loops it encloses, the colour typed for it, and the opaque solid hatch
 * that hides what is drawn before it. The app's FILL command and its button call these, so a fill made by either is the same shape.
 */

import type { DraftShape, HatchShape, Pt } from './draft-types.js';

const CIRCLE_STEPS = 64;

const NAMED: Readonly<Record<string, string>> = {
  white: '#ffffff', black: '#000000', grey: '#808080', gray: '#808080', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00',
};

/** The loop a closed shape encloses (a circle as a 64-sided polygon), or null for a line, an arc or an open polyline. */
export function fillLoopsOf(shape: DraftShape): Pt[][] | null {
  if (shape.type === 'polyline') return shape.closed && shape.pts.length >= 3 ? [shape.pts] : null;
  if (shape.type !== 'circle') return null;
  return [Array.from({ length: CIRCLE_STEPS }, (_, i) => ({ x: shape.c.x + shape.r * Math.cos((i / CIRCLE_STEPS) * Math.PI * 2), y: shape.c.y + shape.r * Math.sin((i / CIRCLE_STEPS) * Math.PI * 2) }))];
}

/** A typed colour (empty: white; a name, `#rgb` or `#rrggbb`) as `#rrggbb`, or null when it is not one. */
export function fillColourOf(text: string): string | null {
  const word = text.trim().toLowerCase();
  if (word === '') return '#ffffff';
  if (NAMED[word]) return NAMED[word];
  if (/^#[0-9a-f]{6}$/.test(word)) return word;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(word);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : null;
}

/** The opaque solid hatch over `loops`, in `fill`. */
export function maskingFill(loops: Pt[][], fill: string): HatchShape {
  return { type: 'hatch', loops, pattern: 'SOLID', scale: 1, angle: 0, opaque: true, fill };
}
