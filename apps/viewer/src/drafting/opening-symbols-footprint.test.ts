/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { MeshData } from '@ifc-lite/geometry';
import { doorSymbol, hullCandidates, minAreaRect, openingSymbols, windowSymbol } from './opening-symbols';
import { worldToDrawing } from './frame';
import type { Pt } from './types';

/** A seeded generator, so a failure names the case that failed. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** A door-like cloud: a rotated box of `width` x `depth` at `centre`, with many vertices inside it, on its edges and repeated (a mesh's split normals). */
function cloud(r: () => number, centre: Pt, width: number, depth: number, n: number): Pt[] {
  const a = r() < 0.3 ? 0 : r() * Math.PI;
  const u = { x: Math.cos(a), y: Math.sin(a) }, v = { x: -u.y, y: u.x };
  const at = (s: number, t: number): Pt => ({ x: centre.x + u.x * s + v.x * t, y: centre.y + u.y * s + v.y * t });
  const out: Pt[] = [];
  for (const [s, t] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) out.push(at((s * width) / 2, (t * depth) / 2));
  for (let i = 0; i < n; i++) {
    const k = r();
    const s = (r() - 0.5) * width, t = (r() - 0.5) * depth;
    // On an edge, inside, or a copy of a point already there.
    if (k < 0.3) out.push(at(s, (r() < 0.5 ? -1 : 1) * depth / 2));
    else if (k < 0.4) out.push(at((r() < 0.5 ? -1 : 1) * width / 2, t));
    else if (k < 0.6) out.push({ ...out[Math.floor(r() * out.length)] });
    else out.push(at(s, t));
  }
  return out;
}

const flat = (pts: Pt[]) => Float64Array.from(pts.flatMap((p) => [p.x, p.y]));

describe('hullCandidates', () => {
  it('keeps every point the minimum-area rectangle depends on: the rectangle of the candidates is the rectangle of all the points', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const r = rng(seed);
      const far = r() < 0.5 ? 1000 * r() : 0;
      const pts = cloud(r, { x: far, y: -far }, 0.2 + 2 * r(), 0.01 + 0.3 * r(), 20 + Math.floor(r() * 400));
      const kept = hullCandidates(flat(pts), pts.length);
      assert.deepEqual(minAreaRect(kept), minAreaRect(pts), `seed ${seed}`);
      assert.ok(kept.length <= pts.length);
    }
  });

  it('drops the points well inside, and keeps everything when the points are all on one line or one point', () => {
    const square: Pt[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    const inner = Array.from({ length: 20 }, (_, i) => ({ x: 0.2 + i * 0.03, y: 0.5 }));
    assert.deepEqual(hullCandidates(flat([...square, ...inner]), 24), square);
    const line = Array.from({ length: 12 }, (_, i) => ({ x: i, y: 2 * i }));
    assert.equal(hullCandidates(flat(line), 12).length, 12);
    const point = Array.from({ length: 12 }, () => ({ x: 3, y: 4 }));
    assert.equal(hullCandidates(flat(point), 12).length, 12);
    assert.equal(minAreaRect(line), null, 'points on one line make no rectangle');
    assert.equal(minAreaRect(hullCandidates(flat(line), 12)), null);
  });
});

/** A mesh whose `positions` reads are counted. */
function counted(expressId: number, ifcType: string, positions: number[], origin: [number, number, number], reads: Map<number, number>): MeshData {
  const data = new Float32Array(positions);
  return {
    expressId, ifcType, origin,
    get positions() { reads.set(expressId, (reads.get(expressId) ?? 0) + 1); return data; },
  } as unknown as MeshData;
}

function boxPositions(r: () => number, w: number, h: number, d: number, extra: number): number[] {
  const out: number[] = [];
  for (const x of [-w / 2, w / 2]) for (const y of [0, h]) for (const z of [-d / 2, d / 2]) out.push(x, y, z);
  for (let i = 0; i < extra; i++) out.push((r() - 0.5) * w, r() * h, (r() - 0.5) * d);
  return out;
}

describe('openingSymbols over a model of several storeys (#154)', () => {
  const reads = new Map<number, number>();
  const r = rng(7);
  // A door and a window on the ground floor (0 to 3 m), a door upstairs (3 to 6 m), and a wall.
  const meshes: MeshData[] = [
    counted(1, 'IfcDoor', boxPositions(r, 0.9, 2.1, 0.05, 300), [2, 0, 1], reads),
    counted(2, 'IfcWindow', boxPositions(r, 1.2, 1.2, 0.08, 300), [5, 0.9, 1], reads),
    counted(3, 'IfcDoor', boxPositions(r, 1.0, 2.1, 0.05, 300), [2, 3, 1], reads),
    counted(4, 'IfcWall', boxPositions(r, 4, 3, 0.2, 0), [0, 0, 0], reads),
  ];
  const ground = { axis: 'y' as const, position: 1.2, flipped: false };
  const upper = { axis: 'y' as const, position: 4.2, flipped: true };

  it('draws each symbol from the minimum-area rectangle of its projected vertices, as before', () => {
    for (const plane of [ground, upper]) {
      const expected = meshes.slice(0, 3).flatMap((m) => {
        const p = m.positions, o = m.origin!;
        const ys = [...p].filter((_, i) => i % 3 === 1).map((y) => o[1] + y);
        if (plane.position < Math.min(...ys) || plane.position > Math.max(...ys)) return [];
        const pts: Pt[] = [];
        for (let i = 0; i + 2 < p.length; i += 3) pts.push(worldToDrawing(plane, { x: o[0] + p[i], y: o[1] + p[i + 1], z: o[2] + p[i + 2] }));
        const rect = minAreaRect(pts)!;
        if (m.ifcType === 'IfcWindow') return [{ id: m.expressId, kind: 'window', shapes: windowSymbol(rect) }];
        const door = doorSymbol(rect, 0, undefined);
        return [{ id: m.expressId, kind: 'door', shapes: door.thin, heavy: door.heavy, dashed: door.dashed }];
      });
      assert.deepEqual(openingSymbols(meshes, plane), expected);
    }
  });

  it('reads the doors and windows of the storeys a plan does not cut once per model, not once per plan', () => {
    openingSymbols(meshes, ground);
    reads.clear();
    const upstairs = openingSymbols(meshes, upper);
    assert.deepEqual(upstairs.map((s) => s.id), [3]);
    assert.equal(reads.get(1) ?? 0, 0, 'the ground-floor door is not read again for the upper plan');
    assert.equal(reads.get(2) ?? 0, 0, 'nor the ground-floor window');
    assert.equal(reads.get(4) ?? 0, 0, 'nor the wall');
  });

  it('reads them again when the mesh list grows', () => {
    const list = [...meshes];
    openingSymbols(list, upper);
    list.push(counted(5, 'IfcDoor', boxPositions(r, 0.8, 2.1, 0.05, 10), [8, 3, 1], reads));
    reads.clear();
    assert.deepEqual(openingSymbols(list, upper).map((s) => s.id), [3, 5]);
    assert.ok((reads.get(1) ?? 0) > 0, 'the list is indexed again');
  });
});
