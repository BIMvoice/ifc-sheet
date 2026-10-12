/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The symbol a section line leaves on its plan: the cut line, a view arrow at
 * each end pointing at the side the section looks toward, and the section's
 * name beside each stem. Plain drafted shapes, so the symbol prints, selects,
 * moves and undoes like any other drawing.
 */

import type { AnnotationShape, DraftShape, Pt } from './types';

/** Stem length in text heights. */
const STEM = 4;
/** Arrowhead barb length (text heights) and its half-angle off the stem. */
const BARB = 0.8;
const BARB_HALF_ANGLE = Math.PI / 7;

export function sectionSymbolShapes(a: Pt, b: Pt, side: Pt, name: string, height: number): (DraftShape | AnnotationShape)[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return [];
  // The unit normal on the picked side of the line.
  let nx = -dy / len;
  let ny = dx / len;
  if ((side.x - a.x) * nx + (side.y - a.y) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  const stem = STEM * height;
  const tip = (p: Pt): Pt => ({ x: p.x + nx * stem, y: p.y + ny * stem });
  const label = (p: Pt): AnnotationShape => ({ type: 'text', p: { x: tip(p).x + nx * height * 0.5, y: tip(p).y + ny * height * 0.5 }, text: name, height, rotation: 0 });
  // Two barbs sweeping back from the tip toward the cut line close the stem into an arrow.
  const barbs = (p: Pt): DraftShape[] => {
    const t = tip(p);
    const r = BARB * height;
    const c = Math.cos(BARB_HALF_ANGLE);
    const s = Math.sin(BARB_HALF_ANGLE);
    // The stem direction reversed (-n), turned by +/- the half angle.
    return [1, -1].map((k) => ({
      type: 'line' as const,
      a: t,
      b: { x: t.x + r * (-nx * c - k * -ny * s), y: t.y + r * (-ny * c + k * -nx * s) },
    }));
  };
  return [
    { type: 'line', a, b },
    { type: 'line', a, b: tip(a) },
    { type: 'line', a: b, b: tip(b) },
    ...barbs(a),
    ...barbs(b),
    label(a),
    label(b),
  ];
}
