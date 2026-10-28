/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Dimension lines line up: while a new linear / aligned dimension's line is
 * being placed, it jumps onto a parallel existing dimension line that is
 * close, so strings of dimensions share one line. Only the offset moves; the
 * cursor's position along the line is kept.
 */

import { dimensionLayout } from './annotation';
import type { AnnotationShape, DraftEntity, DraftShape, Pt } from './types';
import { COINCIDENT, add, cross, dist, dot, scale, sub } from './vec';

type DimensionShape = Extract<AnnotationShape, { type: 'dimension' }>;

export interface DimensionAlignment {
  /** Where the dimension line goes: the cursor, or the cursor moved onto an existing line. */
  at: Pt;
  /** The existing dimension line it aligned to, extended to span the new line too; null when not aligned. */
  guide: { a: Pt; b: Pt } | null;
}

/** A parallel-ness limit on the sine of the angle between two dimension lines. */
const PARALLEL = 1e-6;

const lineOf = (d: DimensionShape): { a: Pt; b: Pt } | null => {
  const line = dimensionLayout(d).lines[2];
  return line && dist(line.a, line.b) > COINCIDENT ? line : null;
};

/**
 * Align the line of the dimension `a`–`b` (`variant`) placed at `cursor` to the
 * nearest parallel line in `existing` within `tolerance` (drawing units).
 */
export function alignDimensionLine(
  a: Pt, b: Pt, variant: 'aligned' | 'linear', cursor: Pt, existing: readonly DimensionShape[], tolerance: number,
): DimensionAlignment {
  const own: DimensionShape = { type: 'dimension', variant, a, b, at: cursor, height: 1 };
  const mine = lineOf(own);
  const none: DimensionAlignment = { at: cursor, guide: null };
  if (!mine) return none;
  const dir = scale(sub(mine.b, mine.a), 1 / dist(mine.a, mine.b));
  const n = { x: -dir.y, y: dir.x };
  let best: { delta: number; other: { a: Pt; b: Pt } } | null = null;
  for (const dim of existing) {
    const other = lineOf(dim);
    if (!other) continue;
    const od = scale(sub(other.b, other.a), 1 / dist(other.a, other.b));
    if (Math.abs(cross(dir, od)) > PARALLEL) continue;
    const delta = dot(sub(other.a, cursor), n);
    if (Math.abs(delta) <= tolerance && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, other };
  }
  if (!best) return none;
  const at = add(cursor, scale(n, best.delta));
  // A linear dimension reads its sense from where the line sits: keep it if the move would flip it.
  const moved = lineOf({ ...own, at });
  if (!moved || Math.abs(cross(dir, sub(moved.b, moved.a))) > PARALLEL * dist(moved.a, moved.b)) return none;
  const ends = [best.other.a, best.other.b, moved.a, moved.b].map((p) => ({ p, t: dot(p, dir) }));
  ends.sort((x, y) => x.t - y.t);
  return { at, guide: { a: ends[0].p, b: ends[ends.length - 1].p } };
}

/** The glyph that shows a dimension line has snapped to another: a small diamond on the line, beside the guide line the other dimension's line is extended to. */
export function alignGlyph(alignment: DimensionAlignment, size: number): DraftShape[] {
  if (!alignment.guide) return [];
  const { at } = alignment;
  const h = size / 2;
  return [
    { type: 'line', a: alignment.guide.a, b: alignment.guide.b },
    { type: 'polyline', pts: [{ x: at.x - h, y: at.y }, { x: at.x, y: at.y - h }, { x: at.x + h, y: at.y }, { x: at.x, y: at.y + h }], closed: true },
  ];
}

/**
 * Where grip `key` of dimension `id` goes when dragged to `p`: its line (`at`)
 * aligns to a close parallel dimension line of the same view, as it does while
 * being placed. Any other grip, entity or no near line: `p` as it is, no guide.
 */
export function alignDraggedGrip(drafts: readonly DraftEntity[], id: string, key: string, p: Pt): DimensionAlignment {
  const entity = drafts.find((e) => e.id === id);
  const shape = entity?.shape;
  if (!entity || shape?.type !== 'dimension' || key !== 'at') return { at: p, guide: null };
  const others = drafts.flatMap((e) => (e.id !== id && e.viewId === entity.viewId && e.shape.type === 'dimension' ? [e.shape] : []));
  return alignDimensionLine(shape.a, shape.b, shape.variant, p, others, 2 * shape.height);
}
