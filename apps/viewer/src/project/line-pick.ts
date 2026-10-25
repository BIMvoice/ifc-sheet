/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * "Hide a line" (#33): the line of the model drawing under a point. The lines the screen draws as lines are the ones that can be
 * picked: a cut face's outline is drawn from the face, so the way to take that away is to hide its element. A line seen through
 * other elements (hidden) is not drawn either and is not picked.
 */

import type { Drawing2D, DrawingLine } from '@ifc-lite/drawing-2d';

interface P2 { x: number; y: number }

function distance(p: P2, a: P2, b: P2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** The nearest drawn line within `tolerance` (drawing units) of `p`, or null. */
export function nearestModelLine(drawing: Pick<Drawing2D, 'lines'> | null, p: P2, tolerance: number): DrawingLine | null {
  let best: { line: DrawingLine; d: number } | null = null;
  for (const line of drawing?.lines ?? []) {
    if (line.category === 'cut' || line.visibility === 'hidden') continue;
    const d = distance(p, line.line.start, line.line.end);
    if (d <= tolerance && (!best || d < best.d)) best = { line, d };
  }
  return best?.line ?? null;
}
