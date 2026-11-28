/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The leader a drafted text carries (#479): from the edge of its frame to the tip it points at, in drawing coordinates. The app's
 * sheet and the engine's PDF both place it here. A text box grows up the screen, so where it sits in drawing space depends on which
 * way is up in the view (`up`: +1 for sections and elevations, -1 for plans, whose drawing y points down the screen); the caller
 * says which, never a shared setting.
 */

import { rotatePt } from './draft-vec.js';
import type { AnnotationShape, Pt, TextFrame } from './draft-types.js';
import { hexagonInset, textBlock } from './text-block.js';
import { tableWidthEm, type TextFace } from './text-advance.js';

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const rectCentre = (r: Rect): Pt => ({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });

/** The point of the rectangle nearest `p` (`p` itself when inside). */
export function clampToRect(r: Rect, p: Pt): Pt {
  return { x: Math.min(Math.max(p.x, r.x0), r.x1), y: Math.min(Math.max(p.y, r.y0), r.y1) };
}

/** Where a ray from the middle of a hexagon filling `outer` towards `tip` leaves it (#924); undefined when the tip is inside. */
function hexagonExit(outer: Rect, tip: Pt): Pt | undefined {
  const c = rectCentre(outer);
  const k = hexagonInset(outer.y1 - outer.y0);
  const ring: Pt[] = [
    { x: outer.x0, y: c.y }, { x: outer.x0 + k, y: outer.y0 }, { x: outer.x1 - k, y: outer.y0 },
    { x: outer.x1, y: c.y }, { x: outer.x1 - k, y: outer.y1 }, { x: outer.x0 + k, y: outer.y1 },
  ];
  const d = { x: tip.x - c.x, y: tip.y - c.y };
  // A ray leaves a convex outline at the first side it heads out through: the least t over those sides.
  let t = Infinity;
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const n = { x: b.y - a.y, y: a.x - b.x };
    const reach = (a.x - c.x) * n.x + (a.y - c.y) * n.y;
    const sign = reach < 0 ? -1 : 1;
    const along = sign * (n.x * d.x + n.y * d.y);
    if (along > 0) t = Math.min(t, (sign * reach) / along);
  });
  return t >= 1 ? undefined : { x: c.x + d.x * t, y: c.y + d.y * t };
}

/** Where a leader to `tip` leaves a label's outer box: on its edge towards the tip (on the ellipse for a bubble or a circle, on the sides of a hexagon); undefined when the tip is inside. */
export function leaderStart(outer: Rect, bubble: boolean | 'hexagon', tip: Pt): Pt | undefined {
  if (bubble === 'hexagon') return hexagonExit(outer, tip);
  const c = rectCentre(outer);
  const edge = clampToRect(outer, tip);
  if (edge.x === tip.x && edge.y === tip.y) return undefined;
  if (!bubble) return edge;
  const rx = (outer.x1 - outer.x0) / 2, ry = (outer.y1 - outer.y0) / 2;
  const dx = tip.x - c.x, dy = tip.y - c.y;
  const k = 1 / Math.sqrt((dx / rx) ** 2 + (dy / ry) ** 2);
  return k >= 1 ? undefined : { x: c.x + dx * k, y: c.y + dy * k };
}

type WidthOf = (line: string, face?: TextFace) => number;

/** A text box's corners (frame included), as the text block lays it out, in a view whose screen-up is `up`. */
export function textBoxOf(p: Pt, text: string, height: number, rotation: number, frame: TextFrame | undefined, up: 1 | -1, widthOf: WidthOf = tableWidthEm): Pt[] {
  const { outer } = textBlock(text, height, frame, undefined, widthOf);
  const at = (x: number, y: number): Pt => ({ x: p.x + x, y: p.y - y * up });
  return [at(outer.x0, outer.y1), at(outer.x1, outer.y1), at(outer.x1, outer.y0), at(outer.x0, outer.y0)].map((c) => rotatePt(c, p, rotation));
}

/** The leader a text carries, drawing coordinates: from the edge of its frame to the tip on the element. */
export function textLeaderOf(shape: Extract<AnnotationShape, { type: 'text' }>, up: 1 | -1, widthOf: WidthOf = tableWidthEm): { from: Pt; tip: Pt } | null {
  if (!shape.leader) return null;
  const pts = textBoxOf(shape.p, shape.text, shape.height, shape.rotation, shape.frame, up, widthOf);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const from = leaderStart({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }, shape.frame === 'hexagon' ? 'hexagon' : shape.frame === 'bubble' || shape.frame === 'circle', shape.leader);
  return from ? { from, tip: shape.leader } : null;
}
