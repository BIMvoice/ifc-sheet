/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The boxes the cross-reference marks (a section's "1 / A-301", the elevation marks round the ground plan) are placed against,
 * and the measuring they share: where a text's box is, which way it reaches. Pure; the width of a line of text and the way
 * the plan's screen runs come in as a `DimAllMeasure`, so the app (its browser font) and the command line (the width table)
 * place a mark by the same rule.
 */

import type { DimAllMeasure } from '../dimall/measure.js';
import { textBoxIn } from '../dimall/measure.js';
import type { ObstacleBox } from '../dimall/plan-obstacles.js';
import { axisLayout } from '../dimension-layout.js';
import type { DraftEntity, Pt } from '../draft-types.js';
import { sectionLink } from './section-geometry.js';

/** An axis-aligned box in drawing metres; `dashed`: part of a dashed overlay line (a roof edge, a grid line), which a line may run across. */
export type CrossRefBox = ObstacleBox;

/** The box round `pts`. One pass, no spread: it runs for every obstacle segment and every spot a mark tries (#154). */
export function boxOfPoints(pts: readonly Pt[]): CrossRefBox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
}

/** Whether `a` and `b` come closer than `m`. */
export const boxesOverlap = (a: CrossRefBox, b: CrossRefBox, m: number): boolean => a.x0 - m < b.x1 && a.x1 + m > b.x0 && a.y0 - m < b.y1 && a.y1 + m > b.y0;

export const centreOf = (box: Pt[]): Pt => ({ x: (box[0]!.x + box[2]!.x) / 2, y: (box[0]!.y + box[2]!.y) / 2 });

/** The anchor that puts the middle of `text` (at `height`, turned `rotation`) on `c`. */
export function anchorFor(m: DimAllMeasure, c: Pt, text: string, height: number, rotation: number): Pt {
  const mid = centreOf(textBoxIn(m, { x: 0, y: 0 }, text, height, rotation));
  return { x: c.x - mid.x, y: c.y - mid.y };
}

/** Half the extent of a box along the unit direction `n`. */
export function halfAlong(box: Pt[], n: Pt): number {
  const w = Math.hypot(box[1]!.x - box[0]!.x, box[1]!.y - box[0]!.y);
  const h = Math.hypot(box[3]!.x - box[0]!.x, box[3]!.y - box[0]!.y);
  const u = { x: (box[1]!.x - box[0]!.x) / (w || 1), y: (box[1]!.y - box[0]!.y) / (w || 1) };
  const v = { x: (box[3]!.x - box[0]!.x) / (h || 1), y: (box[3]!.y - box[0]!.y) / (h || 1) };
  return (Math.abs(n.x * u.x + n.y * u.y) * w + Math.abs(n.x * v.x + n.y * v.y) * h) / 2;
}

/** The boxes of what a cross-reference mark must keep clear of on a plan: section lines and their labels, grid axes and their bubbles, any other line or text. */
export function obstacleBoxes(drafts: readonly DraftEntity[], m: DimAllMeasure): CrossRefBox[] {
  const out: CrossRefBox[] = [];
  for (const d of drafts) {
    const sh = d.shape;
    if (sh.type === 'line') out.push(boxOfPoints([sh.a, sh.b]));
    else if (sh.type === 'text') out.push(boxOfPoints(textBoxIn(m, sh.p, sh.text, sh.height, sh.rotation)));
    else if (sh.type === 'axis') {
      const { bubbles, r } = axisLayout(sh);
      out.push(boxOfPoints([sh.a, sh.b, ...bubbles.flatMap((c) => [{ x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y + r }])]));
    } else if (sectionLink(d)) {
      // The head of a section symbol (a circle, a flag, a triangle): its pole and letter are lines and text, the rest is here.
      if (sh.type === 'circle') out.push({ x0: sh.c.x - sh.r, y0: sh.c.y - sh.r, x1: sh.c.x + sh.r, y1: sh.c.y + sh.r });
      else if (sh.type === 'polyline') out.push(boxOfPoints(sh.pts));
      else if (sh.type === 'hatch') out.push(boxOfPoints(sh.loops.flat()));
    }
  }
  return out;
}
