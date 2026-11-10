/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A scale bar laid out for the scale its drawing is shown at: four ticks at
 * 0, s, 2s and 4s metres (0–5–10–20 m at 1:200, 0–2.5–5–10 m at 1:100), the
 * step s the largest round value whose bar stays within `SCALE_BAR_TARGET_MM`
 * of paper. Shapes are in model metres (a `model` symbol), so the drawing's
 * own scale puts the ticks where their labels say; bar height and lettering
 * are sized in paper millimetres at that scale.
 */

import type { SymbolShape } from './symbols.js';

/** The most paper the whole bar may take, mm. */
export const SCALE_BAR_TARGET_MM = 100;
/** Round steps, per decade. */
const STEPS = [1, 2, 2.5, 5] as const;
const BAR_MM = 1.5;
const TICK_MM = 0.8;
const TEXT_MM = 2.5;
/** Average glyph advance, in text heights, to centre a label on its tick. */
const ADVANCE = 0.6;

/** The step s, metres: the largest 1 / 2 / 2.5 / 5 × 10ⁿ with 4·s on paper within the target. */
export function scaleBarStep(scale: number, targetMm = SCALE_BAR_TARGET_MM): number {
  const max = (targetMm * scale) / 1000 / 4;
  let best = 0;
  for (let decade = Math.floor(Math.log10(max)) - 1; decade <= Math.ceil(Math.log10(max)); decade++) {
    for (const k of STEPS) {
      const s = k * 10 ** decade;
      if (s <= max * (1 + 1e-9) && s > best) best = s;
    }
  }
  return best;
}

/** The tick positions, metres from the bar's start. */
export function scaleBarTicks(scale: number, targetMm = SCALE_BAR_TARGET_MM): number[] {
  const s = scaleBarStep(scale, targetMm);
  return [0, s, 2 * s, 4 * s];
}

/** Default label: up to two decimals, no trailing zeros. */
const plain = (v: number): string => String(Number(v.toFixed(2)));

/**
 * The bar's shapes at `scale`, metres, origin at its start, +x along it:
 * the frame, the first and last divisions ruled to read as shaded, a tick
 * and a label per division, and the unit.
 */
export function scaleBarShapes(scale: number, format: (metres: number) => string = plain): SymbolShape[] {
  const m = scale / 1000; // metres per paper millimetre
  const ticks = scaleBarTicks(scale);
  const total = ticks[ticks.length - 1];
  const h = BAR_MM * m;
  const th = TEXT_MM * m;
  const out: SymbolShape[] = [{ type: 'polyline', pts: [{ x: 0, y: 0 }, { x: total, y: 0 }, { x: total, y: h }, { x: 0, y: h }], closed: true }];
  for (const [a, b] of [[ticks[0], ticks[1]], [ticks[2], ticks[3]]]) {
    for (let k = 1; k <= 3; k++) out.push({ type: 'line', a: { x: a, y: (h * k) / 4 }, b: { x: b, y: (h * k) / 4 } });
  }
  for (const x of ticks) {
    const label = format(x);
    out.push({ type: 'line', a: { x, y: 0 }, b: { x, y: h + TICK_MM * m } });
    out.push({ type: 'text', p: { x: x - (label.length * th * ADVANCE) / 2, y: h + TICK_MM * m + 0.6 * m }, text: label, height: th, rotation: 0 });
  }
  out.push({ type: 'text', p: { x: total + 2 * m, y: 0 }, text: 'm', height: th, rotation: 0 });
  return out;
}
