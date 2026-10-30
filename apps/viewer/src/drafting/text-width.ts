/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * How wide a line of text is, in text heights. In the app the browser measures
 * it with the font the text is drawn in, so a frame fits the glyphs that are
 * really there. Where there is no canvas (tests, a worker) a per-character
 * advance table stands in: the widths of a common sans face, so a narrow `i`
 * and a wide `W` are no longer both counted as 0.62 of a height.
 */

import { tableWidthEm, type TextFace } from '@bimvoice/ifcsheet';
import type { FontKind } from './styles';

export { tableWidthEm, type TextFace };

/** A measurer returns the width of `line` in text heights, or null to leave it to the table. */
export type TextMeasurer = (line: string, face: TextFace) => number | null;

let measurer: TextMeasurer | null | undefined;

/** Replace the measurer (tests); null drops to the table, undefined restores the browser's. */
export function setTextMeasurer(m: TextMeasurer | null | undefined): void {
  measurer = m;
  cache.clear();
}

const FAMILY: Record<FontKind, string> = {
  sans: 'ui-sans-serif, system-ui, sans-serif',
  serif: 'ui-serif, Georgia, serif',
  mono: 'ui-monospace, Menlo, monospace',
};

/** The family string the drawing uses for a font (the one place it is spelled). */
export const fontFamilyOf = (font: FontKind | undefined): string => FAMILY[font ?? 'sans'] ?? FAMILY.sans;

const SIZE = 100;
let canvas: CanvasRenderingContext2D | null | undefined;

function browserMeasurer(line: string, face: TextFace): number | null {
  if (canvas === undefined) {
    canvas = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  }
  if (!canvas) return null;
  canvas.font = `${face.italic ? 'italic ' : ''}${face.bold ? 700 : 400} ${SIZE}px ${fontFamilyOf(face.font)}`;
  const w = canvas.measureText(line).width;
  return w > 0 ? w / SIZE : null;
}

const cache = new Map<string, number>();

/** The width of one line of text in text heights. */
export function textWidthEm(line: string, face: TextFace = {}): number {
  if (line === '') return 0;
  const key = `${face.font ?? 'sans'}|${face.bold ? 1 : 0}|${face.italic ? 1 : 0}|${measurer === undefined ? 'b' : measurer === null ? 't' : 'c'}|${line}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const measured = measurer === null ? null : (measurer ?? browserMeasurer)(line, face);
  const w = measured ?? tableWidthEm(line, face);
  if (cache.size > 2000) cache.clear();
  cache.set(key, w);
  return w;
}
