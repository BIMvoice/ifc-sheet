/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The outline of a set of polygons that tile a shape (the bands of a wall cut in material layers): the edges two bands share cancel,
 * what is left is the boundary, chained into closed rings. Exact on the bands' own vertices, so the outline has the area of the
 * bands together, never more and never less (the generator's own whole cross-section, `layerBaseCutPolygons`, can differ where a wall
 * has openings, and is made only when the layers differ in colour).
 */

import type { Polygon2D } from '@ifc-lite/drawing-2d';

type P = { x: number; y: number };

/** Vertices closer than this (metres) are one; a vertex this close to an edge splits it. */
const SNAP = 1e-4;
const key = (p: P) => `${Math.round(p.x / SNAP)}:${Math.round(p.y / SNAP)}`;

const signedArea = (r: readonly P[]) => r.reduce((s, a, i) => { const b = r[(i + 1) % r.length]; return s + a.x * b.y - b.x * a.y; }, 0) / 2;

function inside(p: P, ring: readonly P[]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** `ring` with every vertex of `all` that lies on one of its edges added there, so two bands that meet along a line meet at the same points. */
function split(ring: readonly P[], all: readonly P[]): P[] {
  const out: P[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    out.push(a);
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    const on: { t: number; p: P }[] = [];
    for (const p of all) {
      const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
      if (t <= 0 || t >= 1) continue;
      if (Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)) <= SNAP && key(p) !== key(a) && key(p) !== key(b)) on.push({ t, p });
    }
    out.push(...on.sort((u, v) => u.t - v.t).map((o) => o.p));
  }
  return out;
}

/** Drop the vertices a ring passes straight through. */
function straighten(ring: P[]): P[] {
  let r = ring;
  for (let changed = true; changed && r.length > 3;) {
    changed = false;
    r = r.filter((p, i) => {
      const a = r[(i + r.length - 1) % r.length], b = r[(i + 1) % r.length];
      const straight = Math.abs((p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x)) <= SNAP * Math.hypot(b.x - a.x, b.y - a.y);
      if (straight) changed = true;
      return !straight;
    });
  }
  return r;
}

/**
 * The outline of `polygons` as polygons (an outer ring each, with its holes), or `null` when the edges do not close into rings (the
 * caller keeps the bands then).
 */
export function outlineOf(polygons: readonly Polygon2D[]): Polygon2D[] | null {
  const rings: P[][] = [];
  for (const poly of polygons) {
    // Outers counter-clockwise, holes clockwise: the edge two bands share is then walked in opposite directions by them.
    if (poly.outer.length >= 3) rings.push(signedArea(poly.outer) >= 0 ? [...poly.outer] : [...poly.outer].reverse());
    for (const h of poly.holes) if (h.length >= 3) rings.push(signedArea(h) <= 0 ? [...h] : [...h].reverse());
  }
  const all = rings.flat();
  const edges = new Map<string, { a: P; b: P }>();
  for (const ring of rings) {
    const pts = split(ring, all);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (key(a) === key(b)) continue;
      const back = `${key(b)}>${key(a)}`;
      if (edges.has(back)) edges.delete(back);
      else edges.set(`${key(a)}>${key(b)}`, { a, b });
    }
  }
  const from = new Map<string, { a: P; b: P }[]>();
  for (const e of edges.values()) from.set(key(e.a), [...(from.get(key(e.a)) ?? []), e]);
  const loops: P[][] = [];
  const used = new Set<{ a: P; b: P }>();
  for (const start of edges.values()) {
    if (used.has(start)) continue;
    const loop: P[] = [];
    let e = start;
    for (;;) {
      used.add(e);
      loop.push(e.a);
      if (key(e.b) === key(start.a)) break;
      const next = from.get(key(e.b))?.find((n) => !used.has(n));
      if (!next) return null;
      e = next;
    }
    if (loop.length < 3) return null;
    loops.push(straighten(loop));
  }
  const outers = loops.filter((l) => signedArea(l) > 0);
  const holes = loops.filter((l) => signedArea(l) < 0);
  if (outers.length === 0) return null;
  const out = outers.map((outer) => ({ outer, holes: [] as P[][] }));
  for (const hole of holes) {
    const home = out.filter((o) => inside(hole[0], o.outer)).sort((u, v) => signedArea(u.outer) - signedArea(v.outer))[0];
    if (!home) return null;
    home.holes.push(hole);
  }
  return out;
}
