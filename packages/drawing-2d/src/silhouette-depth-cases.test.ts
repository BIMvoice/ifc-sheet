/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The own surface depth of a curved outline (#557, review round 2) must come from the surface the line lies on and
 * only from what of it lies within one raster pixel of the line:
 * - a hollow element seen at an angle (a ring wall tilted half a degree, a hollow pipe running obliquely through the
 *   section) has its inner outline behind its own front, joined to it only across its end caps, and that front hides it;
 * - a thin rail running into the view in a wide drawing (one raster pixel about 4 cm, the whole rail within a pixel of
 *   its outline) keeps the depth it has along its length, so a post or a wall in front of its middle hides it there.
 */
import { describe, it, expect } from 'vitest';
import type { MeshData } from '@ifc-lite/geometry';
import { Drawing2DGenerator } from './drawing-generator.js';
import type { DrawingLine, SectionConfig } from './types.js';

type V = [number, number, number];
const add = (a: V, b: V, s = 1): V => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const deg = Math.PI / 180;

/** A closed tube along `axis` from `base`, length `L`, outer radius `R` and a bore of radius `r` (none when 0); e1 × e2 = -axis. */
function tube(id: number, base: V, axis: V, e1: V, e2: V, R: number, r: number, L: number, sides = 32): MeshData {
  const pos: number[] = [];
  const ring = (rad: number, s: number) => {
    for (let k = 0; k < sides; k++) {
      const a = (2 * Math.PI * k) / sides;
      pos.push(...add(add(add(base, axis, s), e1, rad * Math.cos(a)), e2, rad * Math.sin(a)));
    }
  };
  ring(R, 0); ring(R, L);
  const idx: number[] = [];
  const at = (row: number, k: number) => row * sides + (k % sides);
  if (r > 0) {
    ring(r, 0); ring(r, L);
    for (let k = 0; k < sides; k++) {
      const n = k + 1;
      idx.push(at(0, k), at(1, k), at(1, n), at(0, k), at(1, n), at(0, n));
      idx.push(at(2, k), at(2, n), at(3, n), at(2, k), at(3, n), at(3, k));
      idx.push(at(1, k), at(3, k), at(3, n), at(1, k), at(3, n), at(1, n));
      idx.push(at(0, k), at(2, n), at(2, k), at(0, k), at(0, n), at(2, n));
    }
  } else {
    pos.push(...base, ...add(base, axis, L));
    const c0 = 2 * sides, c1 = c0 + 1;
    for (let k = 0; k < sides; k++) {
      const n = k + 1;
      idx.push(at(0, k), at(1, k), at(1, n), at(0, k), at(1, n), at(0, n));
      idx.push(at(1, k), c1, at(1, n));
      idx.push(at(0, k), at(0, n), c0);
    }
  }
  return { expressId: id, ifcType: 'IfcMember', modelIndex: 0, positions: new Float32Array(pos), normals: new Float32Array(pos.length), indices: new Uint32Array(idx), color: [1, 1, 1, 1] };
}

function box(id: number, min: V, max: V): MeshData {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const p = [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1];
  const idx = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5];
  return { expressId: id, ifcType: 'IfcWall', modelIndex: 0, positions: new Float32Array(p), normals: new Float32Array(p.length), indices: new Uint32Array(idx), color: [1, 1, 1, 1] };
}

/** A section at x = 0 looking toward -x, 60 m deep: u = -z, v = y. */
async function section(meshes: MeshData[], id: number): Promise<DrawingLine[]> {
  const config: SectionConfig = {
    plane: { axis: 'x', position: 0, flipped: false, customPlane: { normal: { x: 1, y: 0, z: 0 }, distance: 0, origin: { x: 0, y: 0, z: 0 }, tangent: { x: 0, y: 0, z: -1 }, bitangent: { x: 0, y: 1, z: 0 } } },
    projectionDepth: 60, projectionBelowDepth: 60, projectionAboveDepth: 0,
    clipProjectionBands: true, includeHiddenLines: true, creaseAngle: 30, scale: 100,
  };
  const g = new Drawing2DGenerator();
  await g.initialize();
  const d = await g.generate(meshes, config, { useGPU: false, mergeLines: false, includeProjection: true, includeEdges: true, includeHiddenLines: true });
  return d.lines.filter((l) => l.category === 'projection' && l.entityId === id);
}

/** Visible and hidden length of the lines along u = `u` (vertical) or v = `v` (horizontal), within [lo, hi] along them. */
function along(lines: DrawingLine[], o: { u?: number; v?: number; tol?: number; lo?: number; hi?: number }): { visible: number; hidden: number } {
  const out = { visible: 0, hidden: 0 };
  const tol = o.tol ?? 0.01;
  for (const l of lines) {
    const { start: s, end: e } = l.line;
    let a: number, b: number;
    if (o.u !== undefined) {
      if (Math.abs(s.x - e.x) > 1e-3 || Math.abs(s.x - o.u) > tol) continue;
      a = s.y; b = e.y;
    } else {
      if (Math.abs(s.y - e.y) > 1e-3 || Math.abs(s.y - (o.v ?? 0)) > tol) continue;
      a = s.x; b = e.x;
    }
    const lo = Math.max(Math.min(a, b), o.lo ?? -Infinity), hi = Math.min(Math.max(a, b), o.hi ?? Infinity);
    if (hi > lo) out[l.visibility === 'visible' ? 'visible' : 'hidden'] += hi - lo;
  }
  return out;
}

describe('own surface depth of a curved outline, from the surface it lies on (#557)', () => {
  it('hides the inner outline of a ring wall tilted half a degree toward the viewer behind its own front', async () => {
    const tilt = 0.5 * deg;
    const ring = tube(9, [-5, 0, 0], [Math.sin(tilt), Math.cos(tilt), 0], [Math.cos(tilt), -Math.sin(tilt), 0], [0, 0, 1], 2, 1.8, 3);
    const lines = await section([ring], 9);
    for (const u of [-2, 2]) expect(along(lines, { u }).visible, `outer outline at u ${u}`).toBeGreaterThan(2.7);
    for (const u of [-1.8, 1.8]) {
      const at = along(lines, { u });
      expect(at.hidden, `inner outline at u ${u} is drawn hidden`).toBeGreaterThan(2.7);
      // Visible only at its very top, where nothing is in front; the classifier resolves a line to a twentieth of it.
      expect(at.visible, `inner outline at u ${u}: visible only at its top`).toBeLessThanOrEqual(0.15 + 1e-6);
    }
  });

  for (const angle of [10, 30, 60]) {
    it(`hides the bore of a hollow pipe ${angle}° to the section plane behind the pipe's own wall`, async () => {
      const phi = angle * deg;
      const axis: V = [Math.sin(phi), 0, Math.cos(phi)];
      const L = 6;
      const pipe = tube(9, add([-5, 1, 0], axis, -L / 2), axis, [0, 1, 0], [Math.cos(phi), 0, -Math.sin(phi)], 0.15, 0.13, L);
      const lines = await section([pipe], 9);
      const seen = L * Math.cos(phi);
      for (const v of [1.15, 0.85]) expect(along(lines, { v, tol: 0.003 }).visible, `outer outline at v ${v}`).toBeGreaterThan(0.9 * seen);
      for (const v of [1.13, 0.87]) {
        const at = along(lines, { v, tol: 0.003 });
        expect(at.hidden, `bore at v ${v} is drawn hidden`).toBeGreaterThan(0.9 * seen);
        expect(at.visible, `bore at v ${v} is not seen through the pipe's wall`).toBeLessThan(0.05 * seen);
      }
    });
  }

  it('hides a thin rail running into a wide drawing behind a post or a wall in front of its middle', async () => {
    const phi = 45 * deg;
    const axis: V = [Math.sin(phi), 0, Math.cos(phi)];
    // A 40 mm rail, 8 m long, 45° to the plane; a small box 38 m off widens the drawing to 41 m (a raster pixel ~4 cm).
    const rail = tube(7, add([-5, 1, 0], axis, -4), axis, [0, 1, 0], [Math.cos(phi), 0, -Math.sin(phi)], 0.02, 0, 8);
    const far = box(8, [-6, 0, 38], [-5.9, 0.1, 38.1]);
    for (const gap of [0.1, 0.3, 1]) {
      for (const [name, id] of [['its own post', 7], ['a wall', 11]] as const) {
        const front = box(id, [-4.8 + gap, 0, -0.2], [-4.6 + gap, 2, 0.2]);
        const lines = await section([rail, far, front], 7);
        for (const v of [1.02, 0.98]) {
          // The middle of the 0.4 m the wall covers: the classifier places a change of visibility to within a twentieth of a line.
          const behind = along(lines, { v, tol: 0.006, lo: -0.05, hi: 0.05 });
          expect(behind.visible, `rail at v ${v} behind ${name} ${gap} m in front of it`).toBeLessThan(0.01);
        }
      }
    }
  });
});
