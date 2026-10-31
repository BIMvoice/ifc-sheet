/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A seeded differential test of the shell check against the brute-force reference (#611): closed surfaces of every family
 * in `shell-fuzz-scenes.ts`, moved, turned and scaled, at the origin and at site coordinates, sampled on and near faces,
 * rims and corners and with the ray aimed through vertices. The seeds never change, so a failure here is a real one.
 */

import { describe, expect, it } from 'vitest';
import { FAMILIES, RAY, tetra } from './__fixtures__/shell-fuzz-scenes.js';
import { fast, fieldOf, reading, reference, sceneOf, seeded, type Scene, type Tri, type V } from './__fixtures__/shell-reference.js';

const NAMES = Object.keys(FAMILIES);

/** Turned half the time, scaled, and moved: 5e6 m is a georeferenced site. */
function placement(r: () => number, offset: number): (p: V) => V {
  const scale = r() < 0.5 ? 1 : 10 ** (Math.floor(r() * 7) - 3);
  const q = [r() - 0.5, r() - 0.5, r() - 0.5, r() - 0.5];
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  const [w, x, y, z] = q.map((v) => v / l);
  const turned = r() < 0.6;
  return (p) => {
    const a: V = turned ? [
      (1 - 2 * (y * y + z * z)) * p[0] + 2 * (x * y - z * w) * p[1] + 2 * (x * z + y * w) * p[2],
      2 * (x * y + z * w) * p[0] + (1 - 2 * (x * x + z * z)) * p[1] + 2 * (y * z - x * w) * p[2],
      2 * (x * z - y * w) * p[0] + 2 * (y * z + x * w) * p[1] + (1 - 2 * (x * x + y * y)) * p[2],
    ] : p;
    return [a[0] * scale + offset, a[1] * scale + offset * 0.7, a[2] * scale - offset * 0.3];
  };
}

const offsetOf = (i: number): number => (i % 3 === 0 ? 5e6 : i % 3 === 1 ? 0 : 2 ** (i % 40));

const lerp = (a: readonly number[], b: readonly number[], t: number): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Points on a face, a rim and a corner, at every distance off them down to rounding, in a face's plane, and with the ray through a corner or a rim. */
function samples({ s }: Scene, r: () => number, count: number): V[] {
  const P = s.points, T = s.triangles;
  const at = (id: number): V => [P[id * 3], P[id * 3 + 1], P[id * 3 + 2]];
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  P.forEach((v, i) => { lo[i % 3] = Math.min(lo[i % 3], v); hi[i % 3] = Math.max(hi[i % 3], v); });
  const span = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  const out: V[] = [];
  for (let c = 0; c < count; c++) {
    const t = Math.floor(r() * (T.length / 3)) * 3;
    const a = at(T[t]), b = at(T[t + 1]), d = at(T[t + 2]);
    const nx = (b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]);
    const ny = (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]);
    const nz = (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0]);
    const nl = Math.hypot(nx, ny, nz) || 1;
    const n: V = [nx / nl, ny / nl, nz / nl];
    const on = lerp(lerp(a, b, r()), d, r());
    const mid = lerp(a, b, 0.5);
    const eps = span * 10 ** -(r() * 17) * (r() < 0.5 ? 1 : -1);
    const off = (q: V, k: number): V => [q[0] + k * n[0], q[1] + k * n[1], q[2] + k * n[2]];
    const aim = (q: V): V => {
      const k = span * r(), sx = r() < 0.5 ? 1 : -1, sy = r() < 0.5 ? 1 : -1, sz = r() < 0.5 ? 1 : -1;
      return [q[0] - sx * RAY[0] * k, q[1] - sy * RAY[1] * k, q[2] - sz * RAY[2] * k];
    };
    out.push([
      [lo[0] + r() * (hi[0] - lo[0]), lo[1] + r() * (hi[1] - lo[1]), lo[2] + r() * (hi[2] - lo[2])] as V,
      on, mid, a, off(on, eps), off(mid, eps),
      [a[0] + eps * (r() - 0.5), a[1] + eps * (r() - 0.5), a[2] + eps * (r() - 0.5)] as V,
      aim(r() < 0.5 ? a : mid),
      lerp(on, lerp(on, a, -1), r() * 3),
    ][c % 9]);
  }
  return out;
}

/** A tetrahedron around the point so the ray from it runs along an edge, through a corner, or in a face's plane. */
function aimedTetra(r: () => number, place: (p: V) => V): { scene: Scene; p: V } {
  const p: V = [r() - 0.5, r() - 0.5, r() - 0.5];
  const along = (t: number): V => [p[0] + RAY[0] * t, p[1] + RAY[1] * t, p[2] + RAY[2] * t];
  const far: V = [p[0] - 10, p[1] - 10, p[2] - 10];
  const u: V = [RAY[1], -RAY[0], 0];
  const q = along(0.01);
  const flip = r() < 0.5;
  const shapes: Tri[][] = [
    tetra(q, along(0.02), [far[0], p[1], p[2]], far, flip),
    tetra(q, [far[0], p[1] - 1, p[2]], [p[0] - 1, far[1], p[2]], far, flip),
    tetra([q[0] + u[0], q[1] + u[1], q[2]], [q[0] - u[0], q[1] - u[1], q[2]], along(0.03), far, flip),
  ];
  return { scene: sceneOf([shapes[Math.floor(r() * shapes.length)].map((t) => t.map(place) as Tri)]), p: place(p) };
}

describe('the shell check on seeded closed surfaces (#611)', () => {
  it('reads w as the full sum at every point: 4000 scenes, on and off the surfaces, at the origin and at site coordinates', () => {
    let proven = 0, summed = 0, skipped = 0, aimedProven = 0, readings = 0;
    for (let i = 0; i < 4000; i++) {
      const r = seeded(611_000 + i);
      const family = NAMES[i % NAMES.length];
      const place = placement(r, offsetOf(i));
      const scene = sceneOf(FAMILIES[family](r).map((sh) => sh.map((t) => t.map(place) as Tri)));
      const { field, sum } = fieldOf(scene);
      for (const p of samples(scene, r, 45)) {
        const got = field(...p), want = sum(...p);
        readings++;
        if (reading(got) !== reading(want)) expect.fail(`${family} seed ${611_000 + i} at ${p.join()}: ${got} against the sum's ${want}`);
        if (Number.isInteger(got) && !Number.isInteger(want)) {
          proven++;
          // The bound promises more than the reading: within 0.05 of the sum.
          if (Math.abs(got - want) >= 0.05) expect.fail(`${family} seed ${611_000 + i} at ${p.join()}: ${got} is ${Math.abs(got - want)} from the sum`);
        } else {
          summed++;
          if (!Object.is(got, want)) expect.fail(`${family} seed ${611_000 + i} at ${p.join()}: unproven, yet ${got} is not the sum's ${want}`);
        }
        if (reading(want) === 'skip') skipped++;
      }
      const aimed = aimedTetra(r, place);
      const f2 = fieldOf(aimed.scene);
      const got = f2.field(...aimed.p), want = f2.sum(...aimed.p);
      if (reading(got) !== reading(want)) expect.fail(`aimed seed ${611_000 + i} at ${aimed.p.join()}: ${got} against the sum's ${want}`);
      if (Number.isInteger(got) && !Number.isInteger(want)) aimedProven++;
    }
    expect(readings).toBe(4000 * 45);
    expect(proven).toBeGreaterThan(30_000);
    expect(summed).toBeGreaterThan(30_000);
    expect(skipped).toBeGreaterThan(10_000);
    expect(aimedProven).toBeGreaterThan(500);
  }, 120_000);

  it('answers as the reference does on 400 scenes, all three answers among them', () => {
    const seen = { null: 0, overlapping: 0, notOriented: 0 };
    for (let i = 0; i < 400; i++) {
      const r = seeded(74_000 + i);
      const family = NAMES[i % NAMES.length];
      const place = placement(r, offsetOf(i));
      const scene = sceneOf(FAMILIES[family](r).map((sh) => sh.map((t) => t.map(place) as Tri)));
      const want = reference(scene);
      seen[want ?? 'null']++;
      expect(fast(scene), `${family} seed ${74_000 + i}`).toBe(want);
    }
    expect(seen.null).toBeGreaterThan(40);
    expect(seen.overlapping).toBeGreaterThan(40);
    expect(seen.notOriented).toBeGreaterThan(20);
  }, 120_000);
});
