/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Editing a chain of dimensions (as in ArchiCAD): points added to it, removed
 * from it, or the chain split in two. A chain is the dimensions the DIM
 * commands continue from one another: each starts where the previous ended, on
 * the previous one's dimension line, and none is marked as the start of a new
 * chain (`chainBreak`). Each edit returns the whole next list of drafts, so the
 * caller commits it as one undo step.
 */

import { freshProjectId } from '@/project/view-defaults';
import { dimensionLayout } from './annotation';
import { continueDimension, type DimensionShape } from './dimension-chain';
import type { DraftEntity, Pt } from './types';
import { COINCIDENT, add, dist, dot, scale, sub } from './vec';

/** The param that marks a dimension as the first of its chain, though it starts where another ends. */
export const CHAIN_BREAK = 'chainBreak';

type Dim = DraftEntity & { shape: DimensionShape };
const isDim = (e: DraftEntity): e is Dim => e.shape.type === 'dimension';

/** The unit direction and normal of a dimension's line, or null when it has no length. */
function frameOf(d: DimensionShape): { a: Pt; dir: Pt; n: Pt } | null {
  const line = dimensionLayout(d).lines[2];
  if (!line || dist(line.a, line.b) < COINCIDENT) return null;
  const dir = scale(sub(line.b, line.a), 1 / dist(line.a, line.b));
  return { a: line.a, dir, n: { x: -dir.y, y: dir.x } };
}

/** `next` continues `prev`: it starts at `prev`'s end, on `prev`'s line, and is not a marked start. */
function continues(prev: Dim, next: Dim): boolean {
  if (next.params[CHAIN_BREAK] === true || prev.viewId !== next.viewId || prev.shape.variant !== next.shape.variant) return false;
  if (dist(prev.shape.b, next.shape.a) > COINCIDENT) return false;
  const p = frameOf(prev.shape), q = frameOf(next.shape);
  return !!p && !!q && Math.abs(dot(sub(q.a, p.a), p.n)) < COINCIDENT && Math.abs(dot(q.dir, p.n)) < 1e-6;
}

/** The chain `id` belongs to, in order from its start; empty when `id` is no dimension. */
export function chainOf(drafts: readonly DraftEntity[], id: string): Dim[] {
  const dims = drafts.filter(isDim);
  const start = dims.find((d) => d.id === id);
  if (!start) return [];
  const chain = [start];
  for (let prev = dims.find((d) => continues(d, chain[0])); prev && !chain.includes(prev); prev = dims.find((d) => continues(d, chain[0]))) chain.unshift(prev);
  for (let next = dims.find((d) => continues(chain.at(-1) as Dim, d)); next && !chain.includes(next); next = dims.find((d) => continues(chain.at(-1) as Dim, d))) chain.push(next);
  return chain;
}

/** The chain's measured points, in order. */
export const chainPoints = (chain: readonly Dim[]): Pt[] => (chain.length === 0 ? [] : [chain[0].shape.a, ...chain.map((d) => d.shape.b)]);

/** The dimension from `a` to `b` on the same line as `like` (its own text, if it had any, stays with it). */
function onLineOf(like: DimensionShape, a: Pt, b: Pt): DimensionShape | null {
  const f = frameOf(like);
  if (!f || dist(a, b) < COINCIDENT) return null;
  const mid = scale(add(a, b), 0.5);
  return { type: 'dimension', variant: like.variant, a, b, at: add(mid, scale(f.n, dot(sub(f.a, mid), f.n))), height: like.height };
}

const replace = (drafts: readonly DraftEntity[], edit: (d: DraftEntity) => DraftEntity | DraftEntity[]): DraftEntity[] => drafts.flatMap(edit);

/** Where along dimension `d`'s line the point `p` falls: 0 at its start, 1 at its end. */
function along(d: DimensionShape, p: Pt): number | null {
  const f = frameOf(d);
  const span = f ? dot(sub(d.b, d.a), f.dir) : 0;
  return f && Math.abs(span) > COINCIDENT ? dot(sub(p, d.a), f.dir) / span : null;
}

/**
 * The drafts with a point added to the chain of `id`: a point between its ends
 * splits the dimension it falls in, one beyond an end extends the chain there.
 * `null` when nothing would change (no chain, or the point is already one).
 */
export function addChainPoint(drafts: readonly DraftEntity[], id: string, p: Pt): DraftEntity[] | null {
  const chain = chainOf(drafts, id);
  if (chain.length === 0 || chainPoints(chain).some((q) => dist(p, q) < COINCIDENT)) return null;
  const inside = chain.find((d) => { const t = along(d.shape, p); return t !== null && t > 0 && t < 1; });
  if (inside) {
    const first = onLineOf(inside.shape, inside.shape.a, p), second = onLineOf(inside.shape, p, inside.shape.b);
    if (!first || !second) return null;
    const fresh: DraftEntity = { ...inside, id: freshProjectId('draft'), shape: second, params: withoutBreak(inside.params) };
    return replace(drafts, (d) => (d.id === inside.id ? [{ ...d, shape: first }, fresh] : d));
  }
  const last = chain.at(-1) as Dim;
  const t = along(last.shape, p);
  if (t !== null && t >= 1) {
    const next = continueDimension(last.shape, p);
    return next ? [...drafts, { ...last, id: freshProjectId('draft'), shape: next, params: withoutBreak(last.params) }] : null;
  }
  const head = chain[0], before = onLineOf(head.shape, p, head.shape.a);
  if (!before) return null;
  return replace(drafts, (d) => (d.id === head.id ? [{ ...head, id: freshProjectId('draft'), shape: before, params: withoutBreak(head.params) }, d] : d));
}

function withoutBreak(params: DraftEntity['params']): DraftEntity['params'] {
  const { [CHAIN_BREAK]: _, ...rest } = params;
  return rest;
}

/** The index of the chain point within `tolerance` of `p`, nearest first, or -1. */
function pointNear(chain: readonly Dim[], p: Pt, tolerance: number): number {
  let best = -1, bestD = tolerance;
  chainPoints(chain).forEach((q, i) => { const d = dist(p, q); if (d <= bestD) { best = i; bestD = d; } });
  return best;
}

/**
 * The drafts with the chain's point nearest `p` (within `tolerance`) removed:
 * an end point drops its dimension, one between two joins them into one. `null`
 * when no point is near, or the chain is one dimension (erase that instead).
 */
export function removeChainPoint(drafts: readonly DraftEntity[], id: string, p: Pt, tolerance: number): DraftEntity[] | null {
  const chain = chainOf(drafts, id);
  const i = pointNear(chain, p, tolerance);
  if (chain.length < 2 || i < 0) return null;
  if (i === 0 || i === chain.length) {
    const gone = chain[i === 0 ? 0 : chain.length - 1];
    return drafts.filter((d) => d.id !== gone.id);
  }
  const left = chain[i - 1], right = chain[i];
  const joined = onLineOf(left.shape, left.shape.a, right.shape.b);
  if (!joined) return null;
  return drafts.filter((d) => d.id !== right.id).map((d) => (d.id === left.id ? { ...d, shape: joined } : d));
}

/**
 * The drafts with the chain split in two at its point nearest `p`: the
 * dimensions look as they did, and are two chains now (an end point splits
 * nothing). `null` when no inner point is near.
 */
export function splitChain(drafts: readonly DraftEntity[], id: string, p: Pt, tolerance: number): DraftEntity[] | null {
  const chain = chainOf(drafts, id);
  const i = pointNear(chain, p, tolerance);
  if (i <= 0 || i >= chain.length) return null;
  const head = chain[i];
  return drafts.map((d) => (d.id === head.id ? { ...d, params: { ...d.params, [CHAIN_BREAK]: true } } : d));
}
