/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * CHAMFER and the rubber-band preview of FILLET and CHAMFER while the second line is picked (#189). Both work on a drafted line or a
 * line of the generated drawing, through the same {@link commitSides} FILLET uses.
 */

import { chamferLines, filletLines } from '../fillet';
import { isGeometry, type DraftShape, type Pt } from '../types';
import { commitSides, type FilletSide } from './edit-model-line';
import type { DraftContext } from './types';
import { boundariesFor } from './edit';

/** CHAMFER: cut the corner `distance` along each line. False when the lines cannot be chamfered. */
export function chamferSides(ctx: DraftContext, first: FilletSide, second: FilletSide, distance: number): boolean {
  const result = chamferLines(first.shape, first.at, second.shape, second.at, distance, distance);
  if (!result) return false;
  commitSides(ctx, first, second, { first: result.first, second: result.second, joint: result.line });
  return true;
}

/** How close, in drawing metres, the cursor must be to a line for the preview to take it as the second line. */
const HOVER = 0.1;

function distanceToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * What the corner would get if the cursor's line were the second one: the arc of a fillet or the cut of a chamfer, or nothing when
 * no line is under the cursor, it is the first line itself, or the lines cannot be joined.
 */
export function cornerPreview(ctx: DraftContext, first: FilletSide, cursor: Pt, kind: 'fillet' | 'chamfer', size: number): DraftShape[] {
  const around = boundariesFor(ctx, { id: null, shape: first.shape }, 1000);
  let best: { shape: Extract<DraftShape, { type: 'line' }>; d: number } | null = null;
  for (const s of around) {
    if (s.type !== 'line' || !isGeometry(s)) continue;
    const same = (p: Pt, q: Pt) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-6;
    if ((same(s.a, first.shape.a) && same(s.b, first.shape.b)) || (same(s.a, first.shape.b) && same(s.b, first.shape.a))) continue;
    const d = distanceToSegment(cursor, s.a, s.b);
    if (d <= HOVER && (!best || d < best.d)) best = { shape: s, d };
  }
  if (!best) return [];
  if (kind === 'fillet') {
    const r = filletLines(first.shape, first.at, best.shape, cursor, size);
    return r?.arc ? [r.arc] : [];
  }
  const r = chamferLines(first.shape, first.at, best.shape, cursor, size, size);
  return r?.line ? [r.line] : [];
}
