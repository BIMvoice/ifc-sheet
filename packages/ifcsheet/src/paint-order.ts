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
 * this cheap. Two faces that pass through each other cannot be ordered right by any order of whole triangles; their overlap point
 * decides.
 */

/** A point of the drawing. */
interface Pt { x: number; y: number }

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
/** An overlap on the drawing smaller than this (square metres) is a shared edge, not an overlap. */
const AREA_EPS = 1e-6;

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

/** How much farther `x` is than `y` where they overlap on the drawing; 0 when they do not overlap. */
function behindBy(x: PaintItem, y: PaintItem): number {
  const overlap = clip(x.corners, y.corners);
  if (overlap.length < 3) return 0;
  let area = 0;
  for (let i = 1; i + 1 < overlap.length; i++) area += cross(overlap[0], overlap[i], overlap[i + 1]) / 2;
  if (!(area > AREA_EPS)) return 0;
  // The overlap is convex, so the mean of its corners lies inside it.
  const mid = { x: overlap.reduce((s, p) => s + p.x, 0) / overlap.length, y: overlap.reduce((s, p) => s + p.y, 0) / overlap.length };
  return depthAt(x, mid) - depthAt(y, mid);
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

/** `items` in the order they are painted: far first, and a deep triangle after the one it stands in front of. */
export function paintOrder<T extends PaintItem>(items: readonly T[]): T[] {
  // The mean order: far first; inside a layer by colour, so equal colours run together.
  const base = items.slice().sort((x, y) => y.layer - x.layer || (x.colour < y.colour ? -1 : x.colour > y.colour ? 1 : 0));
  const n = base.length;
  const lo = base.map((t) => Math.min(...t.depths));
  const hi = base.map((t) => Math.max(...t.depths));
  const box = base.map((t) => {
    const xs = t.corners.map((p) => p.x);
    const ys = t.corners.map((p) => p.y);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  });
  // `first[v]`: the triangles after v in the mean order that must be painted before it. A sweep from near to far keeps the triangles
  // still reaching past the current one's nearest depth; a flat face drops out at once.
  const first: number[][] = Array.from({ length: n }, () => []);
  const byNear = Array.from({ length: n }, (_, i) => i).sort((i, j) => lo[i] - lo[j]);
  let active: number[] = [];
  for (const t of byNear) {
    active = active.filter((a) => hi[a] > lo[t]);
    for (const a of active) {
      if (!(hi[t] > lo[a]) || (hi[a] - lo[a] <= LAYER && hi[t] - lo[t] <= LAYER)) continue;
      if (box[a][0] >= box[t][2] || box[t][0] >= box[a][2] || box[a][1] >= box[t][3] || box[t][1] >= box[a][3]) continue;
      const [early, late] = a < t ? [a, t] : [t, a];
      // The mean order paints `early` first; that is wrong when `late` is behind it where they overlap.
      if (behindBy(base[late], base[early]) > LAYER) first[early].push(late);
    }
    active.push(t);
  }
  const waits = first.map((f) => f.length);
  const then: number[][] = Array.from({ length: n }, () => []);
  first.forEach((f, v) => { for (const w of f) then[w].push(v); });
  // Kahn's order, the earliest of the mean order whenever there is a choice. Every constraint points later in the mean order, so
  // there is no cycle and every triangle is painted.
  const ready = indexHeap();
  for (let v = 0; v < n; v++) if (waits[v] === 0) ready.push(v);
  const out: T[] = [];
  for (let v = ready.pop(); v !== undefined; v = ready.pop()) {
    out.push(base[v]);
    for (const w of then[v]) if (--waits[w] === 0) ready.push(w);
  }
  return out;
}
