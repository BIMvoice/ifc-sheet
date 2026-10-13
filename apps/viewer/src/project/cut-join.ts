/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Joining cut faces of the same kind, so a drawing shows no line where two
 * walls meet (a corner, a T, a wall continued by another): the outline of
 * their union instead of each one's own.
 *
 * Each ring edge is split where another face's edges cross or touch it; a
 * piece inside another face is dropped, and so is a piece two faces share
 * from opposite sides (they abut there). Where two faces overlap along an
 * edge from the same side, the piece is kept once. What is left chains into
 * closed rings: counter-clockwise ones are outlines, clockwise ones holes.
 *
 * Pure, and exact up to `TOL` (metres). A group whose pieces do not close into
 * rings is given back unjoined, so a degenerate input draws as before.
 */

export interface Pt2 {
  x: number;
  y: number;
}

export interface Face {
  outer: Pt2[];
  holes: Pt2[][];
}

/**
 * Points this close are one (metres): model geometry arrives in single
 * precision, so faces that meet in the model meet only to a few micrometres
 * here; 0.05 mm is far below anything a drawing shows.
 */
const TOL = 5e-5;
/** How far beside an edge its inside is looked for, metres. */
const SIDE = 1e-3;

interface Edge {
  a: Pt2;
  b: Pt2;
  face: number;
}

const signedArea = (ring: readonly Pt2[]): number => {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
};

/** The ring wound as wanted: outlines counter-clockwise, holes clockwise. */
const wound = (ring: readonly Pt2[], ccw: boolean): Pt2[] => ((signedArea(ring) > 0) === ccw ? [...ring] : [...ring].reverse());

function edgesOf(face: Face, index: number): Edge[] {
  const out: Edge[] = [];
  const push = (ring: Pt2[]) => {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      if (Math.hypot(b.x - a.x, b.y - a.y) > TOL) out.push({ a, b, face: index });
    }
  };
  push(wound(face.outer, true));
  for (const h of face.holes) push(wound(h, false));
  return out;
}

function onSegment(p: Pt2, a: Pt2, b: Pt2): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < TOL * TOL) return Math.hypot(p.x - a.x, p.y - a.y) < TOL;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  if (t < -TOL || t > 1 + TOL) return false;
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y) < TOL * 10;
}

function insideRing(p: Pt2, ring: readonly Pt2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const insideFace = (p: Pt2, f: Face): boolean => insideRing(p, f.outer) && !f.holes.some((h) => insideRing(p, h));
const onFace = (p: Pt2, edges: readonly Edge[]): boolean => edges.some((e) => onSegment(p, e.a, e.b));

/** Whether `p` is inside `face` and not on its outline (within `TOL`). */
export function strictlyInside(p: Pt2, face: Face): boolean {
  if (!insideFace(p, face)) return false;
  return ![face.outer, ...face.holes].some((ring) => ring.some((a, i) => onSegment(p, a, ring[(i + 1) % ring.length])));
}

/** Parameters along a→b where c→d crosses it or its ends touch it (collinear overlaps included). */
function splits(a: Pt2, b: Pt2, c: Pt2, d: Pt2): number[] {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const len2 = rx * rx + ry * ry;
  const out: number[] = [];
  const along = (p: Pt2) => ((p.x - a.x) * rx + (p.y - a.y) * ry) / len2;
  for (const p of [c, d]) if (onSegment(p, a, b)) out.push(along(p));
  const den = rx * sy - ry * sx;
  if (Math.abs(den) > 1e-12) {
    const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
    const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
    if (t > 0 && t < 1 && u >= -1e-9 && u <= 1 + 1e-9) out.push(t);
  }
  return out;
}

/** A coarse grid over the edges, so each edge meets only its neighbours. */
function grid(edges: readonly Edge[]): (e: Edge) => Edge[] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const e of edges) {
    minX = Math.min(minX, e.a.x, e.b.x); maxX = Math.max(maxX, e.a.x, e.b.x);
    minY = Math.min(minY, e.a.y, e.b.y); maxY = Math.max(maxY, e.a.y, e.b.y);
  }
  const n = Math.max(1, Math.ceil(Math.sqrt(edges.length / 4)));
  const cw = Math.max((maxX - minX) / n, TOL);
  const ch = Math.max((maxY - minY) / n, TOL);
  const cells = new Map<number, Edge[]>();
  const range = (e: Edge, f: (k: number) => void) => {
    const x0 = Math.floor((Math.min(e.a.x, e.b.x) - minX - TOL) / cw), x1 = Math.floor((Math.max(e.a.x, e.b.x) - minX + TOL) / cw);
    const y0 = Math.floor((Math.min(e.a.y, e.b.y) - minY - TOL) / ch), y1 = Math.floor((Math.max(e.a.y, e.b.y) - minY + TOL) / ch);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) f(x * 100003 + y);
  };
  for (const e of edges) range(e, (k) => { const c = cells.get(k); if (c) c.push(e); else cells.set(k, [e]); });
  return (e) => {
    const seen = new Set<Edge>();
    range(e, (k) => { for (const o of cells.get(k) ?? []) seen.add(o); });
    return [...seen];
  };
}

const cell = (v: number): number => Math.round(v / (TOL * 4));
const key = (p: Pt2): string => `${cell(p.x)},${cell(p.y)}`;
/** The keys of the cells round `p`: two points within `TOL` may fall either side of a cell edge. */
const keysNear = (p: Pt2): string[] => {
  const cx = cell(p.x), cy = cell(p.y);
  const out: string[] = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) out.push(`${cx + dx},${cy + dy}`);
  return out;
};
const near2 = (p: Pt2, q: Pt2): boolean => Math.hypot(p.x - q.x, p.y - q.y) <= TOL * 2;

/** Consecutive collinear points dropped. */
function simplify(ring: Pt2[]): Pt2[] {
  const out: Pt2[] = [];
  for (let i = 0; i < ring.length; i++) {
    const prev = ring[(i + ring.length - 1) % ring.length];
    const p = ring[i];
    const next = ring[(i + 1) % ring.length];
    const cross = (p.x - prev.x) * (next.y - p.y) - (p.y - prev.y) * (next.x - p.x);
    if (Math.abs(cross) > TOL * TOL * 100) out.push(p);
  }
  return out.length >= 3 ? out : ring;
}

/**
 * The union of `faces` as faces of its own: each outline with the holes it
 * holds. `null` when the pieces do not close (the caller keeps the faces as
 * they were).
 */
export function unionFaces(faces: readonly Face[]): Face[] | null {
  if (faces.length < 2) return faces.map((f) => ({ outer: [...f.outer], holes: f.holes.map((h) => [...h]) }));
  const edges = faces.flatMap((f, i) => edgesOf(f, i));
  const near = grid(edges);
  const byFace = faces.map((_, i) => edges.filter((e) => e.face === i));
  const kept: { a: Pt2; b: Pt2 }[] = [];
  for (const e of edges) {
    const others = near(e).filter((o) => o.face !== e.face);
    const ts = [0, 1];
    for (const o of others) ts.push(...splits(e.a, e.b, o.a, o.b));
    const sorted = [...new Set(ts.map((t) => Math.min(1, Math.max(0, t))))].sort((p, q) => p - q);
    const otherFaces = [...new Set(others.map((o) => o.face))];
    for (let i = 0; i + 1 < sorted.length; i++) {
      const t0 = sorted[i], t1 = sorted[i + 1];
      if (t1 - t0 < 1e-9) continue;
      const a = { x: e.a.x + (e.b.x - e.a.x) * t0, y: e.a.y + (e.b.y - e.a.y) * t0 };
      const b = { x: e.a.x + (e.b.x - e.a.x) * t1, y: e.a.y + (e.b.y - e.a.y) * t1 };
      if (Math.hypot(b.x - a.x, b.y - a.y) < TOL) continue;
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      // The face's inside is on the left of its edges (outlines CCW, holes CW).
      const inSide = { x: m.x - ((b.y - a.y) / len) * SIDE, y: m.y + ((b.x - a.x) / len) * SIDE };
      let keep = true;
      for (const f of otherFaces) {
        if (onFace(m, byFace[f])) {
          // Shared: abutting faces (the other's inside is on our outside) drop it; overlapping ones keep it once.
          if (!insideFace(inSide, faces[f])) { keep = false; break; }
          if (f < e.face) { keep = false; break; }
        } else if (insideFace(m, faces[f])) {
          keep = false;
          break;
        }
      }
      if (keep) kept.push({ a, b });
    }
  }
  // Chain the pieces into rings.
  const from = new Map<string, number[]>();
  kept.forEach((s, i) => { const k = key(s.a); const l = from.get(k); if (l) l.push(i); else from.set(k, [i]); });
  const used = new Set<number>();
  const rings: Pt2[][] = [];
  for (let i = 0; i < kept.length; i++) {
    if (used.has(i)) continue;
    const ring: Pt2[] = [];
    let j = i;
    const start = kept[i].a;
    for (;;) {
      used.add(j);
      ring.push(kept[j].a);
      const end = kept[j].b;
      if (near2(end, start) && ring.length > 1) break;
      const next = keysNear(end).flatMap((k) => from.get(k) ?? []).find((n) => !used.has(n) && near2(kept[n].a, end));
      if (next === undefined) {
        if (near2(end, start)) break;
        return null;
      }
      j = next;
    }
    if (ring.length >= 3) rings.push(simplify(ring));
  }
  const outers = rings.filter((r) => signedArea(r) > 0);
  const holes = rings.filter((r) => signedArea(r) < 0);
  const out: Face[] = outers.map((outer) => ({ outer, holes: [] }));
  for (const h of holes) {
    const holder = out.filter((f) => insideRing(h[0], f.outer) || h.some((p) => insideRing(p, f.outer)))
      .sort((p, q) => Math.abs(signedArea(p.outer)) - Math.abs(signedArea(q.outer)))[0];
    if (!holder) return null;
    holder.holes.push(h);
  }
  return out;
}
