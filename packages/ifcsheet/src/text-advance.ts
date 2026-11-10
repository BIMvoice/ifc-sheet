/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * How wide a line of a drafted text is, in text heights, from a per-character advance table: the widths of a common sans face, so a
 * narrow `i` and a wide `W` are not both counted as 0.62 of a height (#479). The engine measures a drafted text's frame with it.
 * The app measures with the browser's canvas where there is one (`drafting/text-width.ts`) and falls back to this table, so a frame
 * is the same wherever no canvas is. (`text-width.ts` is another measure: the widest usual face, for fitting a cell.)
 */

import type { FontKind } from './draft-styles.js';

/** The face a text is drawn in; absent fields mean the plain sans face. */
export interface TextFace {
  font?: FontKind;
  bold?: boolean;
  italic?: boolean;
}

/** Advance widths in 1/1000 of the text height, by the characters that share one. */
const GROUPS: readonly (readonly [number, string])[] = [
  [222, "ijl"], [260, '|'], [278, " !,./:;I[\\]ft"], [333, '()-`r'], [355, '"'], [191, "'"], [389, '{}'],
  [500, 'ckvxyzJ*^'], [556, '0123456789abdeghnopqu$#_?L'], [584, '+<=>~'], [611, 'FTZ'], [667, 'ABEKPSVXY&'],
  [722, 'CDHNRUw'], [778, 'GOQ'], [833, 'Mm'], [889, '%'], [944, 'W'], [1015, '@'],
];
const ADVANCE = new Map<string, number>(GROUPS.flatMap(([w, chars]) => [...chars].map((c): [string, number] => [c, w])));
const UNKNOWN = 556;
/** Serif faces run a little narrower than sans, bold a little wider; mono is fixed. */
const SERIF = 0.93, BOLD = 1.06, MONO = 0.6;

/** The width of `line` from the table. */
export function tableWidthEm(line: string, face: TextFace = {}): number {
  if (face.font === 'mono') return [...line].length * MONO;
  let w = 0;
  for (const c of line) w += ADVANCE.get(c) ?? UNKNOWN;
  return (w / 1000) * (face.font === 'serif' ? SERIF : 1) * (face.bold ? BOLD : 1);
}
