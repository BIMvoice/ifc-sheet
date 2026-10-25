/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * How wide a line of text prints, in ems, for text that is set in whatever
 * sans-serif the reader's system supplies (`ui-sans-serif`: San Francisco,
 * Segoe UI, DejaVu Sans). The face is not known when the sheet is laid out,
 * so the widths are those of DejaVu Sans, the widest of the usual ones: a
 * line that fits by this measure fits in the others (San Francisco measured
 * within 1% of it on the longest project name of the audit models).
 *
 * A letter with a diacritic ("ș", "ț", "ă", "â", "î") is as wide as its base
 * letter: the mark is a separate combining character after normalising.
 */

/** Advance widths of printable ASCII, thousandths of an em (DejaVu Sans). */
const ASCII_ADVANCE: Readonly<Record<string, number>> = {
  ' ': 318, '!': 401, '"': 460, '#': 838, $: 636, '%': 950, '&': 780, "'": 275, '(': 390, ')': 390, '*': 500, '+': 838,
  ',': 318, '-': 361, '.': 318, '/': 337, ':': 337, ';': 337, '<': 838, '=': 838, '>': 838, '?': 531, '@': 1000,
  A: 684, B: 686, C: 698, D: 770, E: 632, F: 575, G: 775, H: 752, I: 295, J: 295, K: 656, L: 557, M: 863,
  N: 748, O: 787, P: 603, Q: 787, R: 695, S: 635, T: 611, U: 732, V: 684, W: 989, X: 685, Y: 611, Z: 685,
  '[': 390, '\\': 337, ']': 390, '^': 838, _: 500, '`': 500,
  a: 613, b: 635, c: 550, d: 635, e: 615, f: 352, g: 635, h: 634, i: 278, j: 278, k: 579, l: 278, m: 974,
  n: 634, o: 612, p: 635, q: 635, r: 411, s: 521, t: 392, u: 634, v: 592, w: 818, x: 592, y: 592, z: 525,
  '{': 636, '|': 337, '}': 636, '~': 838,
  0: 636, 1: 636, 2: 636, 3: 636, 4: 636, 5: 636, 6: 636, 7: 636, 8: 636, 9: 636,
};

/** A character outside the table (a symbol, CJK) is taken as a full em: wide, so the line is never under-measured. */
const FALLBACK_ADVANCE = 1000;
/** Bold letters are wider; this much over the regular width covers it. */
const BOLD_FACTOR = 1.1;

const COMBINING_MARKS = /\p{M}/u;

/** The width of `text` in ems, at one em of letter height. */
export function textWidthEm(text: string, bold = false): number {
  let total = 0;
  for (const ch of text.normalize('NFD')) {
    if (COMBINING_MARKS.test(ch)) continue;
    total += ASCII_ADVANCE[ch] ?? FALLBACK_ADVANCE;
  }
  return (total / 1000) * (bold ? BOLD_FACTOR : 1);
}

/** The longest start of `text` that, with "…" after it, is at most `maxEm` wide; "…" alone when not even one letter fits. */
export function truncateToWidth(text: string, maxEm: number, bold = false): string {
  const ellipsis = '…';
  const chars = [...text];
  for (let n = chars.length - 1; n > 0; n--) {
    const cut = `${chars.slice(0, n).join('').trimEnd()}${ellipsis}`;
    if (textWidthEm(cut, bold) <= maxEm) return cut;
  }
  return ellipsis;
}
