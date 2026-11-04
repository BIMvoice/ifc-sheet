/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Tracking lines (#667): hover briefly over an endpoint or a corner and it is
 * acquired; the horizontal and vertical through it then guide the cursor, so a
 * point can be put in line with an existing corner without typing a distance.
 * Pure: the pointer hook feeds it the cursor and the clock, the overlay draws
 * what it returns.
 */

import type { Pt } from './types';
import { applyOrtho } from './input';
import { dist } from './vec';

/** How long the cursor rests on a point before it is acquired. */
export const DWELL_MS = 350;
/** Acquired points kept at once; the oldest goes when a new one comes. */
export const MAX_ACQUIRED = 4;

/** A tracking line: the horizontal or the vertical through an acquired point. */
export interface TrackLine {
  from: Pt;
  dir: 'h' | 'v';
}

export interface TrackResult {
  point: Pt;
  /** The lines that put the cursor here: one, or two when it sits where they cross. */
  active: readonly TrackLine[];
}

/** The acquired points and the point the cursor has been resting on. */
export interface TrackState {
  acquired: readonly Pt[];
  pending: { at: Pt; since: number } | null;
}

export const EMPTY_TRACK: TrackState = { acquired: [], pending: null };

const same = (a: Pt, b: Pt): boolean => dist(a, b) < 1e-6;

/**
 * `candidate` is the endpoint or corner under the cursor (null when the cursor is on none).
 * Resting on it starts the clock; moving off before `DWELL_MS` forgets it.
 */
export function hover(state: TrackState, candidate: Pt | null, now: number): TrackState {
  if (!candidate) return state.pending ? { ...state, pending: null } : state;
  if (state.pending && same(state.pending.at, candidate)) return state;
  return { ...state, pending: { at: candidate, since: now } };
}

/** Acquires the resting point once it has rested long enough; resting on an acquired one again lets it go. */
export function tick(state: TrackState, now: number): TrackState {
  const p = state.pending;
  if (!p || now - p.since < DWELL_MS) return state;
  const had = state.acquired.some((a) => same(a, p.at));
  const acquired = had ? state.acquired.filter((a) => !same(a, p.at)) : [...state.acquired, p.at].slice(-MAX_ACQUIRED);
  // Still resting there: it must not count again until the cursor has left.
  return { acquired, pending: { at: p.at, since: Infinity } };
}

/** Every line of every acquired point. */
export function trackLines(acquired: readonly Pt[]): TrackLine[] {
  return acquired.flatMap((from) => [{ from, dir: 'h' as const }, { from, dir: 'v' as const }]);
}

/** The lines that pass within `reach` of the cursor: the ones the overlay draws. */
export function nearLines(acquired: readonly Pt[], cursor: Pt, reach: number): TrackLine[] {
  return trackLines(acquired).filter((l) => (l.dir === 'h' ? Math.abs(cursor.y - l.from.y) : Math.abs(cursor.x - l.from.x)) <= reach);
}

/**
 * The point the tracking lines pull the cursor to, or null when none is within `tolerance`.
 * Where two acquired points' lines cross, that crossing wins. With ortho on from `base`, a line is met on
 * the ortho axis instead (a vertical through a corner, met on the horizontal from the base), so ortho is kept.
 */
export function trackSnap(
  cursor: Pt,
  acquired: readonly Pt[],
  tolerance: number,
  opts: { base?: Pt | null; ortho?: boolean } = {},
): TrackResult | null {
  if (acquired.length === 0) return null;
  const lines = trackLines(acquired);
  const hs = lines.filter((l) => l.dir === 'h');
  const vs = lines.filter((l) => l.dir === 'v');
  const ortho = opts.ortho && opts.base ? opts.base : null;
  const at = ortho ? applyOrtho(ortho, cursor) : cursor;
  const found: { point: Pt; active: TrackLine[]; rank: number }[] = [];
  // A crossing ranks ahead of a single line: it fixes both coordinates.
  for (const h of hs) {
    for (const v of vs) if (!same(h.from, v.from)) found.push({ point: { x: v.from.x, y: h.from.y }, active: [h, v], rank: 0 });
  }
  if (ortho) {
    for (const v of vs) found.push({ point: { x: v.from.x, y: ortho.y }, active: [v], rank: 1 });
    for (const h of hs) found.push({ point: { x: ortho.x, y: h.from.y }, active: [h], rank: 1 });
  } else {
    for (const h of hs) found.push({ point: { x: cursor.x, y: h.from.y }, active: [h], rank: 1 });
    for (const v of vs) found.push({ point: { x: v.from.x, y: cursor.y }, active: [v], rank: 1 });
  }
  const near = found.filter((f) => dist(f.point, at) <= tolerance).sort((a, b) => a.rank - b.rank || dist(a.point, at) - dist(b.point, at));
  return near.length > 0 ? { point: near[0].point, active: near[0].active } : null;
}
