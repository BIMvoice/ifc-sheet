/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The facades of a building outline and what lies on each: openings (door and
 * window edges), the cross walls that meet it, and the thickness of the
 * corner walls. Pure, in the frame where the walls are axis-aligned.
 *
 * Each facade is looked at in its own coordinates: `s` runs along it and `d`
 * outward from it, with the outer face at `D`.
 */

import type { Pt } from '@/drafting/types';
import { boxOf, GRID_TOL, ringOfBox, unionBox, type Box } from './outline';
import type { PlanPart } from './types';

/** Wall pieces and openings meet within this (metres). */
const TOUCH = 0.03;
/** An opening's edge within this of the wall's edge (metres) is that edge. */
const SNAP = 0.06;
/** A facade run shorter than this is a step in the outline, not a facade. */
export const MIN_RUN = 0.3;
/** Runs on one side this close across (metres) are one facade at a reveal in a finish: a plaster coat interrupted at each window is not a second facade. */
const SHALLOW = 0.05;
/** A wall's edge this far from where an opening's frame reaches (metres) can be that opening's jamb. */
const REACH = 0.25;
/** How far outside a frame's edge (metres) a wall's edge can still be that frame's jamb. */
const PAST = 0.03;
/** A body this much wider than its cut (metres) is a round or shaped opening: the cut is not its width. */
const SHAPED = 0.001;
/** Grid lines are averages of what they merge: the real edge of a wall lies within this of its line (metres). */
const LINE_TOL = 0.02;

export interface Facade {
  /** Along-direction (travel) and outward normal, unit axis vectors. */
  u: Pt;
  n: Pt;
  /** The outer face's distance along `n`. */
  D: number;
  /** The extent along `u`. */
  s0: number;
  s1: number;
}

export interface FacadeContent {
  /** Door and window edges along the facade. */
  openings: number[];
  /** The same, per element: the span it fills along the facade and its part id. */
  openingParts: { s0: number; s1: number; id: number }[];
  /** The inner faces of the corner walls. */
  endFaces: number[];
  /** Faces of the cross walls meeting the facade, and their centre lines. */
  crossFaces: number[];
  crossAxes: number[];
}

export interface Opening {
  part: PlanPart;
  box: Box;
  /** The whole element, turned into the frame, when the model's mesh is at hand. */
  body?: Box;
  /** Whether the rings it is cut in lie on the plan's axes, so that its box measures it. */
  onAxes?: boolean;
  /** Set once bridged: whether both edges of the opening are known exactly. An inexact one still fills its gap in the outline, and gets no figure. */
  exact?: boolean;
}

const near = (a: number, b: number, tol = TOUCH) => Math.abs(a - b) <= tol;

/** The facades of a counter-clockwise axis-aligned loop: its straight runs, collinear ones on one line joined. */
export function facadesOf(loop: readonly Pt[]): Facade[] {
  const runs: Facade[] = [];
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i], b = loop[(i + 1) % loop.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < MIN_RUN) continue;
    const u = { x: Math.round((b.x - a.x) / len) + 0, y: Math.round((b.y - a.y) / len) + 0 };
    const n = { x: u.y + 0, y: -u.x + 0 };
    const D = a.x * n.x + a.y * n.y;
    const sa = a.x * u.x + a.y * u.y, sb = b.x * u.x + b.y * u.y;
    runs.push({ u, n, D, s0: Math.min(sa, sb), s1: Math.max(sa, sb) });
  }
  const joined: Facade[] = [];
  for (const r of runs) {
    const same = joined.find((f) => f.u.x === r.u.x && f.u.y === r.u.y && near(f.D, r.D, SHALLOW));
    if (same) {
      same.s0 = Math.min(same.s0, r.s0);
      same.s1 = Math.max(same.s1, r.s1);
      same.D = Math.max(same.D, r.D);
    } else joined.push({ ...r });
  }
  return joined;
}

/** `box` in a facade's coordinates. */
export function inFacade(f: Facade, box: Box): { s0: number; s1: number; d0: number; d1: number } {
  const cs = ringOfBox(box).map((p) => ({ s: p.x * f.u.x + p.y * f.u.y, d: p.x * f.n.x + p.y * f.n.y }));
  return { s0: Math.min(...cs.map((c) => c.s)), s1: Math.max(...cs.map((c) => c.s)), d0: Math.min(...cs.map((c) => c.d)), d1: Math.max(...cs.map((c) => c.d)) };
}

/** The opening along one way of the plan: its band across the walls that host it, and its edges along them. */
function bridge(o: Opening, walls: readonly Box[], horizontal: boolean): Opening | null {
  const [from, to] = horizontal ? [o.box.x0, o.box.x1] : [o.box.y0, o.box.y1];
  const [t0, t1] = horizontal ? [o.box.y0, o.box.y1] : [o.box.x0, o.box.x1];
  let band: [number, number] | null = null;
  for (const w of walls) {
    // A stub of wall beside the opening has no direction of its own: it counts as the wall the opening runs in.
    if (Math.max(w.x1 - w.x0, w.y1 - w.y0) > REACH && w.x1 - w.x0 >= w.y1 - w.y0 !== horizontal) continue;
    const [wl0, wl1, wt0, wt1] = horizontal ? [w.x0, w.x1, w.y0, w.y1] : [w.y0, w.y1, w.x0, w.x1];
    if (wl1 < from - TOUCH || wl0 > to + TOUCH || Math.min(wt1, t1) - Math.max(wt0, t0) <= GRID_TOL) continue;
    band = band ? [Math.min(band[0], wt0), Math.max(band[1], wt1)] : [wt0, wt1];
  }
  if (!band) return null;
  // The opening is the gap in the wall: the wall pieces either side of its middle are its jambs. A frame, a stop, an architrave or a leaf that reaches past them does not widen it, and a frame a little narrower than the gap does not narrow it.
  const mid = (from + to) / 2;
  const jambs = (same: boolean): [number, number] => {
    let lo = -Infinity, hi = Infinity;
    for (const w of walls) {
      const stub = Math.max(w.x1 - w.x0, w.y1 - w.y0) <= REACH;
      if (!stub && w.x1 - w.x0 >= w.y1 - w.y0 !== (same ? horizontal : !horizontal)) continue;
      const [wl0, wl1, wt0, wt1] = horizontal ? [w.x0, w.x1, w.y0, w.y1] : [w.y0, w.y1, w.x0, w.x1];
      // A wall that only grazes the opening's depth (the plaster of a cross wall, a stub beside the door) is not what it sits in.
      if (Math.min(wt1, t1) - Math.max(wt0, t0) < 0.5 * Math.min(wt1 - wt0, t1 - t0)) continue;
      if (wl1 <= mid && wl1 >= from - PAST && wl1 <= from + REACH) lo = Math.max(lo, wl1);
      if (wl0 >= mid && wl0 <= to + PAST && wl0 >= to - REACH) hi = Math.min(hi, wl0);
    }
    return [lo, hi];
  };
  // The wall it runs in first: its own jambs are clean. A cross wall it stops against is the next best.
  const along = jambs(true), across = jambs(false);
  const jamb0 = along[0] > -Infinity ? along[0] : across[0], jamb1 = along[1] < Infinity ? along[1] : across[1];
  // No jamb on a side (a window against a column): the frame's own edge, as long as the frame lies on the plan's axes.
  let l0 = jamb0 > -Infinity ? jamb0 : from, l1 = jamb1 < Infinity ? jamb1 : to;
  let exact = o.onAxes !== false || (jamb0 > -Infinity && jamb1 < Infinity);
  // A round or shaped window: the plan cuts it short of its width, and the jambs at the cut say nothing of it. The whole element says.
  if (o.body) {
    const [b0, b1] = horizontal ? [o.body.x0, o.body.x1] : [o.body.y0, o.body.y1];
    if (b1 - b0 > to - from + SHAPED) { [l0, l1] = [b0, b1]; exact = true; }
  }
  return { part: o.part, exact, box: horizontal ? { x0: l0, x1: l1, y0: band[0], y1: band[1] } : { x0: band[0], x1: band[1], y0: l0, y1: l1 } };
}

/**
 * The openings as the boxes that fill their gap in the wall: the opening's
 * length along the wall times the thickness of the walls it sits in. An
 * opening with no wall piece beside it has no host and is left out.
 */
export function bridgedOpenings(openings: readonly Opening[], walls: readonly Box[]): Opening[] {
  const out: Opening[] = [];
  for (const o of openings) {
    // The longer side of the opening runs along its wall; a near-square one (a window drawn 0.5 x 0.5) is tried both ways. A thin one is never read across its thickness: a gate 1.85 long and 0.2 deep beside another wall would print 0.20.
    const first = o.box.x1 - o.box.x0 >= o.box.y1 - o.box.y0;
    const [w, h] = [o.box.x1 - o.box.x0, o.box.y1 - o.box.y0];
    const nearSquare = Math.min(w, h) >= 0.5 * Math.max(w, h);
    const ways = (nearSquare ? [first, !first] : [first]).map((way) => bridge(o, walls, way)).filter((b): b is Opening => b !== null);
    const best = ways.find((b) => b.exact) ?? ways[0];
    if (best) out.push(best);
  }
  return out;
}

/**
 * Where the facade really ends, from the walls and not from the outline's grid lines, which average what they merge
 * (a corner at -0.025 read -0.019). Null when the outline's run is not the outer face of walls on the plan's axes: a
 * stair-step round a wing at an angle, whose figures nothing in the model would back.
 */
export function facadeEnds(f: Facade, walls: readonly Box[]): { s0: number; s1: number } | null {
  const all = walls.map((w) => inFacade(f, w));
  const onFace = all.filter((w) => near(w.d1, f.D, SHALLOW) && w.s1 > f.s0 - LINE_TOL && w.s0 < f.s1 + LINE_TOL);
  // A run ends at a wall of its own, or at an inner corner against a wall that goes on outward past it.
  const atEnd = [...onFace, ...all.filter((w) => w.d0 <= f.D + SHALLOW && w.d1 > f.D + SHALLOW)];
  const starts = atEnd.map((w) => w.s0).concat(atEnd.map((w) => w.s1)).filter((s) => near(s, f.s0, LINE_TOL));
  const ends = atEnd.map((w) => w.s1).concat(atEnd.map((w) => w.s0)).filter((s) => near(s, f.s1, LINE_TOL));
  if (starts.length === 0 || ends.length === 0) return null;
  return { s0: Math.min(...starts), s1: Math.max(...ends) };
}

/** What lies on the facade `f`; `walls` and `openings` are the plan's parts (openings bridged). */
export function contentOf(f: Facade, walls: readonly Box[], openings: readonly Opening[]): FacadeContent {
  const c: FacadeContent = { openings: [], openingParts: [], endFaces: [], crossFaces: [], crossAxes: [] };
  const sd = walls.map((w) => inFacade(f, w));
  // The facade wall's thickness: the thickest wall lying along it with its outer face on it.
  const along = sd.filter((w) => near(w.d1, f.D) && w.s1 - w.s0 >= w.d1 - w.d0 && w.s1 > f.s0 && w.s0 < f.s1);
  const depth = Math.max(0.05, ...along.map((w) => w.d1 - w.d0));
  for (const o of openings) {
    if (o.exact === false) continue;
    const b = inFacade(f, o.box);
    if (near(b.d1, f.D) && b.s0 >= f.s0 - TOUCH && b.s1 <= f.s1 + TOUCH) {
      c.openings.push(Math.max(b.s0, f.s0), Math.min(b.s1, f.s1));
      c.openingParts.push({ s0: Math.max(b.s0, f.s0), s1: Math.min(b.s1, f.s1), id: o.part.id });
    }
  }
  for (const w of sd) {
    const thinInS = w.s1 - w.s0 < w.d1 - w.d0;
    if (!thinInS || w.d1 < f.D - depth - TOUCH || w.d1 > f.D + TOUCH || w.d0 > f.D - depth - 0.1) continue;
    if (w.s1 < f.s0 - TOUCH || w.s0 > f.s1 + TOUCH) continue;
    if (w.s0 <= f.s0 + TOUCH) c.endFaces.push(w.s1);
    else if (w.s1 >= f.s1 - TOUCH) c.endFaces.push(w.s0);
    else c.crossFaces.push(w.s0, w.s1), c.crossAxes.push((w.s0 + w.s1) / 2);
  }
  // A face inside a door or window is a plaster coat seen past its jamb: the span is the opening's.
  const inOpening = (s: number) => c.openingParts.some((o) => s > o.s0 + GRID_TOL && s < o.s1 - GRID_TOL);
  c.crossFaces = c.crossFaces.filter((s) => !inOpening(s));
  c.crossAxes = c.crossAxes.filter((s) => !inOpening(s));
  c.endFaces = c.endFaces.filter((s) => !inOpening(s));
  return c;
}

export { boxOf, unionBox };
