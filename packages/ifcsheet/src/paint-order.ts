/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The painter's order of the coloured surfaces (#499, #646): far first, so a nearer face covers a farther one.
 *
 * The order is each triangle's mean depth, in one-centimetre layers, by colour inside a layer. That is right for two triangles whose
 * depth ranges do not overlap, and wrong where one spans a long run of depth: a roof slope running from the eave to the ridge has its
 * mean halfway back, so a wall it stands in front of at the eave is painted over it (#646, the pale wedges at the gable ends of
 * AC20-FZK-Haus). So the pairs whose depth ranges overlap, one of them deeper than a layer, are looked at on the drawing: where they
 * overlap, the depth of each at a point inside the overlap says which is in front. When that contradicts the mean order, the one
 * behind is painted before the other, and the one in front waits for it; everything else keeps the mean order and its colour runs.
 *
 * Only contradictions become constraints, and each one makes a triangle wait for one that came later in the mean order, so the
 * constraints never form a cycle. A flat face square to the view (most of a facade) pairs only with the few deep ones, which keeps
 * this cheap.
 *
 * Two faces that pass through each other (each is in front somewhere in their overlap) cannot be ordered right by any order of whole
 * triangles. For those pairs only, the smaller one is split along the line where their depths are equal, and the pieces are ordered
 * like any other triangle (#646, the sections of FZK-Haus). A split piece may cross a third face, so the search repeats a few rounds
 * and stops at a budget.
 */

/** A point of the drawing. */
export interface Pt { x: number; y: number }

/** One triangle to paint: its corners on the drawing (wound positively) and their view depths, in the same order. */
export interface PaintItem {
  /** The mean depth, in layers of one centimetre. */
  layer: number;
  colour: string;
  corners: readonly [Pt, Pt, Pt];
  depths: readonly [number, number, number];
}

/** One layer of the mean order, metres: two faces closer than this where they overlap keep the mean order and its colour runs. */
const LAYER = 0.01;
/** Most rounds of splitting, and most pieces added over the input, so a mesh of many crossings cannot grow without bound. */
const MAX_ROUNDS = 6;
const MAX_EXTRA = (n: number): number => 2000 + n;
/** An overlap on the drawing smaller than this (square metres) is a shared edge, not an overlap. */
const AREA_EPS = 1e-6;
/** A piece of a split triangle smaller than this (square metres) is a sliver and is left out. */
const MIN_PIECE = 1e-8;

const cross = (o: Pt, a: Pt, b: Pt): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** The part of convex polygon `poly` inside the positively wound triangle `tri` (Sutherland-Hodgman). */
function clip(poly: readonly Pt[], tri: readonly Pt[]): Pt[] {
  let out = poly.slice();
  for (let e = 0; e < 3 && out.length > 0; e++) {
    const a = tri[e];
    const b = tri[(e + 1) % 3];
    const input = out;
    out = [];
    input.forEach((cur, i) => {
      const next = input[(i + 1) % input.length];
      const sc = cross(a, b, cur);
      const sn = cross(a, b, next);
      if (sc >= 0) out.push(cur);
      if ((sc >= 0) !== (sn >= 0)) {
        const u = sc / (sc - sn);
        out.push({ x: cur.x + (next.x - cur.x) * u, y: cur.y + (next.y - cur.y) * u });
      }
    });
  }
  return out;
}

/** The view depth of `item`'s plane at `p` on the drawing. */
export function depthAt(item: PaintItem, p: Pt): number {
  const [a, b, c] = item.corners;
  const area = cross(a, b, c);
  const wa = cross(p, b, c) / area;
  const wb = cross(a, p, c) / area;
  return wa * item.depths[0] + wb * item.depths[1] + (1 - wa - wb) * item.depths[2];
}

/**
 * How `x` lies behind `y` where they overlap on the drawing: the depth of `x` minus that of `y` at the overlap's middle (`mid`) and
 * at its farthest (`max`), and whether each is in front somewhere in it (`crossing`). `null` when they do not overlap.
 */
function against(x: PaintItem, y: PaintItem): { mid: number; max: number; crossing: boolean } | null {
  const overlap = clip(x.corners, y.corners);
  if (overlap.length < 3) return null;
  let area = 0;
  for (let i = 1; i + 1 < overlap.length; i++) area += cross(overlap[0], overlap[i], overlap[i + 1]) / 2;
  if (!(area > AREA_EPS)) return null;
  // The overlap is convex, so the mean of its corners lies inside it, and the depth difference is linear across it.
  const mid = { x: overlap.reduce((s, p) => s + p.x, 0) / overlap.length, y: overlap.reduce((s, p) => s + p.y, 0) / overlap.length };
  const diffs = overlap.map((p) => depthAt(x, p) - depthAt(y, p));
  const max = Math.max(...diffs);
  return { mid: depthAt(x, mid) - depthAt(y, mid), max, crossing: max > LAYER && Math.min(...diffs) < -LAYER };
}

/** The pieces of `item` either side of the line where it is as deep as `other`, each `[corners, depths]` wound as `item` is. */
function splitAlong(item: PaintItem, other: PaintItem): { corners: Pt[]; depths: number[] }[] {
  const f = item.corners.map((p, i) => item.depths[i] - depthAt(other, p));
  const sides: { corners: Pt[]; depths: number[] }[] = [{ corners: [], depths: [] }, { corners: [], depths: [] }];
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    const side = sides[f[i] >= 0 ? 0 : 1];
    side.corners.push(item.corners[i]);
    side.depths.push(item.depths[i]);
    if ((f[i] >= 0) !== (f[j] >= 0)) {
      const u = f[i] / (f[i] - f[j]);
      const a = item.corners[i];
      const b = item.corners[j];
      const cut = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
      const d = item.depths[i] + (item.depths[j] - item.depths[i]) * u;
      for (const s of sides) { s.corners.push(cut); s.depths.push(d); }
    }
  }
  return sides.filter((s) => s.corners.length >= 3);
}

/** A min-heap of indices. */
function indexHeap(): { push: (v: number) => void; pop: () => number | undefined } {
  const heap: number[] = [];
  const swap = (i: number, j: number): void => { [heap[i], heap[j]] = [heap[j], heap[i]]; };
  return {
    push(v) {
      heap.push(v);
      for (let i = heap.length - 1; i > 0 && heap[(i - 1) >> 1] > heap[i]; i = (i - 1) >> 1) swap(i, (i - 1) >> 1);
    },
    pop() {
      if (heap.length === 0) return undefined;
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length > 0) {
        heap[0] = last;
        for (let i = 0; ;) {
          const l = 2 * i + 1;
          const m = l + 1 < heap.length && heap[l + 1] < heap[l] ? l + 1 : l;
          if (m >= heap.length || heap[i] <= heap[m]) break;
          swap(i, m);
          i = m;
        }
      }
      return top;
    },
  };
}

/** The mean order: far first; inside a layer by colour, so equal colours run together. */
function meanOrder<T extends PaintItem>(items: readonly T[]): T[] {
  return items.slice().sort((x, y) => y.layer - x.layer || (x.colour < y.colour ? -1 : x.colour > y.colour ? 1 : 0));
}

/**
 * For `base` in the mean order: `first[v]`, the triangles after v that must be painted before it, and `split`, for each triangle that
 * crosses another, that other (one partner per triangle per round). A sweep from near to far keeps the triangles still reaching past
 * the current one's nearest depth; a flat face drops out at once.
 */
function constraints(base: readonly PaintItem[]): { first: number[][]; split: Map<number, number> } {
  const n = base.length;
  const lo = base.map((t) => Math.min(...t.depths));
  const hi = base.map((t) => Math.max(...t.depths));
  const box = base.map((t) => {
    const xs = t.corners.map((p) => p.x);
    const ys = t.corners.map((p) => p.y);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  });
  const first: number[][] = Array.from({ length: n }, () => []);
  const split = new Map<number, number>();
  const area = (t: PaintItem): number => Math.abs(cross(t.corners[0], t.corners[1], t.corners[2]));
  const byNear = Array.from({ length: n }, (_, i) => i).sort((i, j) => lo[i] - lo[j]);
  let active: number[] = [];
  for (const t of byNear) {
    active = active.filter((a) => hi[a] > lo[t]);
    for (const a of active) {
      if (!(hi[t] > lo[a]) || (hi[a] - lo[a] <= LAYER && hi[t] - lo[t] <= LAYER)) continue;
      if (box[a][0] >= box[t][2] || box[t][0] >= box[a][2] || box[a][1] >= box[t][3] || box[t][1] >= box[a][3]) continue;
      const [early, late] = a < t ? [a, t] : [t, a];
      const r = against(base[late], base[early]);
      if (!r) continue;
      if (r.crossing) {
        // Split the smaller of the two along the other, unless one of them is already to be split this round.
        const [s, o] = area(base[a]) <= area(base[t]) ? [a, t] : [t, a];
        if (!split.has(s) && !split.has(o)) split.set(s, o);
      }
      // The mean order paints `early` first; that is wrong when `late` is behind it somewhere they overlap and `early` is nowhere behind
      // it (a pair that crosses is split; until then it goes by the middle of the overlap).
      if (r.crossing ? r.mid > LAYER : r.max > LAYER) first[early].push(late);
    }
    active.push(t);
  }
  // A triangle held back past some later ones is painted over them: those of them in front of it on the drawing wait for it, as the
  // mean order would have had them. (Flat faces never pair in the sweep, so nothing else would say so.)
  // A triangle waits as long as the ones it waits for do, so the reach is followed through them (later ones first: they only wait further on).
  // The new waits can hold others back in turn, so this repeats a few passes until nothing is added.
  const reach = Array.from({ length: n }, (_, v) => v);
  const scanned = new Array<number>(n).fill(0);
  for (let pass = 0; pass < 4; pass++) {
    for (let changed = true; changed;) {
      changed = false;
      for (let v = n - 1; v >= 0; v--) for (const f of first[v]) if (reach[f] > reach[v]) { reach[v] = reach[f]; changed = true; }
    }
    let added = false;
    for (let v = 0; v < n; v++) {
      // Only the part of the reach not looked at in an earlier pass.
      const from = Math.max(v + 1, scanned[v]);
      scanned[v] = Math.max(scanned[v], reach[v]);
      for (let w = from; w < reach[v]; w++) {
        if (lo[w] >= hi[v] - LAYER || base[w].colour === base[v].colour || first[v].includes(w) || first[w].includes(v) || box[v][0] >= box[w][2] || box[w][0] >= box[v][2] || box[v][1] >= box[w][3] || box[w][1] >= box[v][3]) continue;
        const r = against(base[w], base[v]);
        if (r && r.mid < -LAYER) { first[w].push(v); added = true; }
      }
    }
    if (!added) break;
  }
  return { first, split };
}

/**
 * `items` in the order they are painted: far first, a deep triangle after the one it stands in front of, and the triangles that cross
 * another cut in two along it. `piece` makes the item for a part of `item` (default: a copy with the part's corners and depths).
 */
export function paintOrder<T extends PaintItem>(
  items: readonly T[],
  piece: (item: T, corners: readonly [Pt, Pt, Pt], depths: readonly [number, number, number]) => T = (item, corners, depths) => ({
    ...item, corners, depths, layer: Math.round(Math.max(0, (depths[0] + depths[1] + depths[2]) / 3) / LAYER),
  }),
): T[] {
  let base = meanOrder(items);
  const budget = base.length + MAX_EXTRA(base.length);
  let found = constraints(base);
  for (let round = 0; round < MAX_ROUNDS && found.split.size > 0 && base.length + found.split.size * 2 <= budget; round++) {
    const next: T[] = [];
    base.forEach((t, v) => {
      const other = found.split.get(v);
      if (other === undefined) { next.push(t); return; }
      for (const part of splitAlong(t, base[other])) {
        // Each part is a triangle or a quadrilateral: a fan of triangles, wound as the whole is.
        for (let k = 1; k + 1 < part.corners.length; k++) {
          const corners: [Pt, Pt, Pt] = [part.corners[0], part.corners[k], part.corners[k + 1]];
          if (!(cross(...corners) / 2 > MIN_PIECE)) continue;
          next.push(piece(t, corners, [part.depths[0], part.depths[k], part.depths[k + 1]]));
        }
      }
    });
    base = meanOrder(next);
    found = constraints(base);
  }
  const { first } = found;
  const n = base.length;
  const waits = first.map((f) => f.length);
  const then: number[][] = Array.from({ length: n }, () => []);
  first.forEach((f, v) => { for (const w of f) then[w].push(v); });
  // Kahn's order, the earliest of the mean order whenever there is a choice. A constraint that points earlier in the mean order can
  // close a cycle (faces that pass through each other beyond the split budget): what is left then follows in the mean order.
  const ready = indexHeap();
  for (let v = 0; v < n; v++) if (waits[v] === 0) ready.push(v);
  const out: T[] = [];
  const emitted = new Array<boolean>(n).fill(false);
  let stuck = 0;
  for (;;) {
    let v = ready.pop();
    if (v === undefined) {
      // A cycle: break it at the earliest of the mean order still waiting, and go on, so what follows it is not all pushed to the end.
      while (stuck < n && emitted[stuck]) stuck++;
      if (stuck >= n) break;
      v = stuck;
    }
    if (emitted[v]) continue;
    emitted[v] = true;
    out.push(base[v]);
    for (const w of then[v]) if (--waits[w] === 0) ready.push(w);
  }
  return out;
}
