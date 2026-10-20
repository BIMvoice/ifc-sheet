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
/** A facade run shorter than this is a step in the outline, not a facade. */
export const MIN_RUN = 0.3;

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
  /** The inner faces of the corner walls. */
  endFaces: number[];
  /** Faces of the cross walls meeting the facade, and their centre lines. */
  crossFaces: number[];
  crossAxes: number[];
}

export interface Opening {
  part: PlanPart;
  box: Box;
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
    const same = joined.find((f) => f.u.x === r.u.x && f.u.y === r.u.y && near(f.D, r.D, 0.01));
    if (same) {
      same.s0 = Math.min(same.s0, r.s0);
      same.s1 = Math.max(same.s1, r.s1);
    } else joined.push({ ...r });
  }
  return joined;
}

/** `box` in a facade's coordinates. */
export function inFacade(f: Facade, box: Box): { s0: number; s1: number; d0: number; d1: number } {
  const cs = ringOfBox(box).map((p) => ({ s: p.x * f.u.x + p.y * f.u.y, d: p.x * f.n.x + p.y * f.n.y }));
  return { s0: Math.min(...cs.map((c) => c.s)), s1: Math.max(...cs.map((c) => c.s)), d0: Math.min(...cs.map((c) => c.d)), d1: Math.max(...cs.map((c) => c.d)) };
}

/**
 * The openings as the boxes that fill their gap in the wall: the opening's
 * length along the wall times the thickness of the walls it sits in. An
 * opening with no wall piece beside it has no host and is left out.
 */
export function bridgedOpenings(openings: readonly Opening[], walls: readonly Box[]): Opening[] {
  const out: Opening[] = [];
  for (const o of openings) {
    const horizontal = o.box.x1 - o.box.x0 >= o.box.y1 - o.box.y0;
    const [l0, l1, t0, t1] = horizontal ? [o.box.x0, o.box.x1, o.box.y0, o.box.y1] : [o.box.y0, o.box.y1, o.box.x0, o.box.x1];
    let band: [number, number] | null = null;
    for (const w of walls) {
      const wh = w.x1 - w.x0 >= w.y1 - w.y0;
      if (wh !== horizontal) continue;
      const [wl0, wl1, wt0, wt1] = horizontal ? [w.x0, w.x1, w.y0, w.y1] : [w.y0, w.y1, w.x0, w.x1];
      if (wl1 < l0 - TOUCH || wl0 > l1 + TOUCH || Math.min(wt1, t1) - Math.max(wt0, t0) <= GRID_TOL) continue;
      band = band ? [Math.min(band[0], wt0), Math.max(band[1], wt1)] : [wt0, wt1];
    }
    if (band) out.push({ part: o.part, box: horizontal ? { x0: l0, x1: l1, y0: band[0], y1: band[1] } : { x0: band[0], x1: band[1], y0: l0, y1: l1 } });
  }
  return out;
}

/** What lies on the facade `f`; `walls` and `openings` are the plan's parts (openings bridged). */
export function contentOf(f: Facade, walls: readonly Box[], openings: readonly Opening[]): FacadeContent {
  const c: FacadeContent = { openings: [], endFaces: [], crossFaces: [], crossAxes: [] };
  const sd = walls.map((w) => inFacade(f, w));
  // The facade wall's thickness: the thickest wall lying along it with its outer face on it.
  const along = sd.filter((w) => near(w.d1, f.D) && w.s1 - w.s0 >= w.d1 - w.d0 && w.s1 > f.s0 && w.s0 < f.s1);
  const depth = Math.max(0.05, ...along.map((w) => w.d1 - w.d0));
  for (const o of openings) {
    const b = inFacade(f, o.box);
    if (near(b.d1, f.D) && b.s0 >= f.s0 - TOUCH && b.s1 <= f.s1 + TOUCH) c.openings.push(Math.max(b.s0, f.s0), Math.min(b.s1, f.s1));
  }
  for (const w of sd) {
    const thinInS = w.s1 - w.s0 < w.d1 - w.d0;
    if (!thinInS || w.d1 < f.D - depth - TOUCH || w.d1 > f.D + TOUCH || w.d0 > f.D - depth - 0.1) continue;
    if (w.s1 < f.s0 - TOUCH || w.s0 > f.s1 + TOUCH) continue;
    if (w.s0 <= f.s0 + TOUCH) c.endFaces.push(w.s1);
    else if (w.s1 >= f.s1 - TOUCH) c.endFaces.push(w.s0);
    else c.crossFaces.push(w.s0, w.s1), c.crossAxes.push((w.s0 + w.s1) / 2);
  }
  return c;
}

export { boxOf, unionBox };
