/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Closed surfaces for the shell check's seeded differential test (#611), each family a shape the hierarchies, the ray or
 * the bound could get wrong: every directed edge is balanced in all of them, so they all reach the proof.
 */

import { box, type Tri, type V } from './shell-reference.js';

/** The ray `windingField` casts, each axis signed by the box: sample points are placed so it runs through what they aim at. */
export const RAY: V = [0.5381, 0.6276, 0.5623];

export const tetra = (a: V, b: V, c: V, d: V, flip = false): Tri[] => {
  const t: Tri[] = [[a, c, b], [a, b, d], [b, c, d], [c, a, d]];
  return flip ? t.map(([p, q, r]) => [p, r, q] as Tri) : t;
};
const OCT: V[] = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const OCTF = [[0,2,4],[2,1,4],[1,3,4],[3,0,4],[2,0,5],[1,2,5],[3,1,5],[0,3,5]];
/** Sphere topology by subdivision; `warp` moves each distinct vertex (self-intersecting closed chains when wild). */
function sphere(level: number, warp: (p: V) => V): Tri[] {
  let tris: Tri[] = OCTF.map((f) => f.map((i) => OCT[i]) as Tri);
  const nrm = (p: V): V => { const l = Math.hypot(...p); return [p[0] / l, p[1] / l, p[2] / l]; };
  const mid = (a: V, b: V): V => nrm([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
  for (let l = 0; l < level; l++) tris = tris.flatMap(([a, b, c]) => { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); return [[a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]] as Tri[]; });
  const seen = new Map<string, V>();
  const m = (p: V): V => { const k = p.join(); let v = seen.get(k); if (!v) { v = warp(p); seen.set(k, v); } return v; };
  return tris.map((t) => t.map(m) as Tri);
}
const rv = (r: () => number, s = 1): V => [(r() - .5) * s, (r() - .5) * s, (r() - .5) * s];
const add = (a: V, b: V, k = 1): V => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]];
/** Closed families (every directed edge balanced), before the transform. */
export const FAMILIES: Record<string, (r: () => number) => Tri[][]> = {
  lattice(r) { const div = 1 + Math.floor(r() * 3); const c = 2 + Math.floor(r() * 3); return Array.from({ length: c }, () => { const lo: V = [Math.floor(r()*6)/4, Math.floor(r()*6)/4, Math.floor(r()*6)/4]; const hi = lo.map((v) => v + (1 + Math.floor(r()*4))/4) as V; return box(lo, hi, div, r() < .25); }); },
  nested(r) { const div = 1 + Math.floor(r() * 4); const sh: Tri[][] = []; let lo: V = [0,0,0], hi: V = [8,8,8]; const d = 1 + Math.floor(r() * 3); for (let i = 0; i < d; i++) { sh.push(box(lo, hi, div, r() < (i % 2 ? .8 : .1))); const m = 1 + r(); lo = lo.map((v) => v + m) as V; hi = hi.map((v) => v - m) as V; } return sh; },
  tetras(r) { const c = 1 + Math.floor(r() * 12); return Array.from({ length: c }, () => tetra(rv(r, 2), rv(r, 2), rv(r, 2), rv(r, 2), r() < .3)); },
  roundSphere(r) { const l = 1 + Math.floor(r() * 2); const c = 1 + Math.floor(r() * 3); return Array.from({ length: c }, () => { const k = 0.2 + r(); const o = rv(r, 1.5); const flip = r() < .3; const tr = sphere(l, (p) => add(o, p, k)); return flip ? tr.map(([a,b,c2]) => [a,c2,b] as Tri) : tr; }); },
  /** Self-intersecting: same topology, wild vertices. */
  wild(r) { const l = 1 + Math.floor(r() * 2); return [sphere(l, () => rv(r, 2))]; },
  sliverPrism(r) { const len = 10 ** (1 + r() * 5), w = 10 ** (-1 - r() * 3); const n = 2 + Math.floor(r() * 10); const sh: Tri[][] = []; for (let i = 0; i < 1 + Math.floor(r()*3); i++) { const y = r() * w * 3, tr: Tri[] = []; const P = (t: number, k: number): V => [t * len, y + (k === 1 ? w : 0), k === 2 ? w : 0]; for (let s = 0; s < n; s++) { const t0 = s / n, t1 = (s + 1) / n; for (let k = 0; k < 3; k++) { const m = (k + 1) % 3; tr.push([P(t0, k), P(t1, k), P(t1, m)], [P(t0, k), P(t1, m), P(t0, m)]); } } tr.push([P(0,0),P(0,1),P(0,2)],[P(1,0),P(1,2),P(1,1)]); sh.push(tr); } return sh; },
  hugeTiny(r) { const big = 10 ** (2 + r() * 4); const div = 1 + Math.floor(r() * 2); const sh = [box([-big,-big,-big],[big,big,big],div)]; for (let i = 0; i < 1 + Math.floor(r()*4); i++) { const o = rv(r, 2), s = 10 ** (-3 + r() * 3); sh.push(box(o, add(o, [s,s,s]), 1 + Math.floor(r()*2), r() < .7)); } return sh; },
  doubled(r) { const b = box([0,0,0],[1,1,1],1 + Math.floor(r()*3)); return r() < .5 ? [b, b.map((t) => [...t] as Tri)] : [b, box([1,0,0],[2,1,1],1 + Math.floor(r()*3))]; },
  /** A closed part with a triangle and its reverse added: every edge balanced, the pair's terms cancel. */
  backPairs(r) { const b = box([0,0,0],[1,1,1],2); const v = b.flat(); const ex: Tri[] = []; for (let i = 0; i < 4; i++) { const a = v[Math.floor(r()*v.length)], c = v[Math.floor(r()*v.length)], d = v[Math.floor(r()*v.length)]; if (a === c || c === d || a === d || a.join() === c.join() || c.join() === d.join() || a.join() === d.join()) continue; ex.push([a,c,d],[a,d,c]); } return [[...b, ...ex]]; },
  /** A zero-area triangle in a closed chain: an edge's midpoint made a vertex on one side only. */
  collinear(r) { const k = 1 + Math.floor(r() * 3); const t = tetra([0,0,0],[1,0,0],[0,1,0],[0,0,1]); const out: Tri[] = []; for (const [a,b,c] of t) { const m: V = [(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2]; if (r() < .5) { out.push([a,m,c],[m,b,c],[b,m,a]); } else out.push([a,b,c]); } return Array.from({length:k},(_,i)=>out.map((tr)=>tr.map((p)=>add(p,[i*.3,0,0])) as Tri)); },
  /** A flat doubled sheet: zero thickness, closed, axis aligned. */
  flat(r) { const a = Math.floor(r()*3); const lo: V = rv(r, 2); const hi = lo.map((v, i) => i === a ? v : v + .5 + r()) as V; return [box(lo, hi, 1 + Math.floor(r()*2)), box([-1,-1,-1],[1,1,1],2, r() < .3)]; },
  /** Piercing or stopping short of a face by about the tolerance. */
  nearTol(r) { const e = [0.2,0.5,0.9,1,1.0000001,1.1,2,5,20][Math.floor(r()*9)]*1e-5*(r()<.5?1:-1); const tip: V = [0.2+r()*.6,0.2+r()*.6,e]; const b0: V = [tip[0]-.1,tip[1]-.1,-1], b1: V = [tip[0]+.1,tip[1]-.1,-1], b2: V = [tip[0],tip[1]+.2,-1]; return [box([0,0,0],[1,1,1],1+Math.floor(r()*2)), tetra(b0,b1,b2,tip,false)]; },
  /** Boxes whose gap or overlap is about the tolerance. */
  gaps(r) { const e = [-2,-1,-.5,0,.5,1,1.0000001,2,5][Math.floor(r()*9)]*1e-5; const div=1+Math.floor(r()*3); return [box([0,0,0],[1,1,1],div), box([1-e,.1,.1],[2,.8,.8],div,r()<.2), box([1-e,-.5,-.5],[1.5,1.5,1.5],div,r()<.2)]; },
};
