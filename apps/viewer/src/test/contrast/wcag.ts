/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * WCAG 2.x contrast math (relative luminance + contrast ratio), plus alpha
 * compositing for a translucent foreground over an opaque backdrop. Pure
 * arithmetic — no DOM, no browser — so it is unit-testable on its own and
 * reusable by any contrast check, not just the tooltip ones.
 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Parses a CSS color string as produced by `getComputedStyle` in Chromium,
 *  which always serializes as `rgb(r, g, b)` or `rgba(r, g, b, a)`. */
export function parseRgba(color: string): Rgba {
  const m = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/);
  if (!m) throw new Error(`Unrecognized computed color: ${color}`);
  return {
    r: Number(m[1]),
    g: Number(m[2]),
    b: Number(m[3]),
    a: m[4] === undefined ? 1 : Number(m[4]),
  };
}

/** Composites `fg` (possibly translucent) over an opaque `bg`, "over" operator. */
export function compositeOver(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance, https://www.w3.org/TR/WCAG21/#dfn-relative-luminance */
export function relativeLuminance({ r, g, b }: Rgba): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** WCAG contrast ratio between two OPAQUE colors, https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const [lighter, darker] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

/** Contrast of a (possibly translucent) foreground text color against an
 *  opaque surface color it is painted on. */
export function contrastOfTextOnSurface(textColor: string, surfaceColor: string): number {
  const surface = parseRgba(surfaceColor);
  const text = parseRgba(textColor);
  const resolvedText = text.a < 1 ? compositeOver(text, surface) : text;
  return contrastRatio(resolvedText, surface);
}

/** WCAG AA minimum for normal-weight text under 18pt (24px) / under 14pt bold (18.66px). */
export const WCAG_AA_NORMAL_TEXT = 4.5;
/** WCAG AA minimum for large text (>=18pt / >=14pt bold). */
export const WCAG_AA_LARGE_TEXT = 3.0;
