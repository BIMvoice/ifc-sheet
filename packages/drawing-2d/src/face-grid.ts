/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The faces of a mesh projected on a drawing plane, and a uniform grid of them, for `outline-depth.ts`. */

import type { MeshData } from '@ifc-lite/geometry';
import type { SectionPlaneConfig } from './types.js';
import { getVertex } from './raster-core.js';
import { projectPointForPlane, signedDepth } from './projection-bands.js';

/**
 * Per face: the three projected vertices, the depth plane `a·u + b·v + c`, its
 * slope and its nearest vertex depth. Per edge of a face seen edge-on (slope
 * slot -1): its two projected ends (the second twice), their depths and the
 * nearer one.
 */
export const STRIDE = 11;
/** Slope slot of an entry that is an edge of a face seen edge-on. */
export const EDGE = -1;

/** World x, y, z, then u, v and depth of a triangle's three corners. */
const CORNER = new Float64Array(18);

/**
 * Push the entries of triangle `t` of `mesh` projected on `plane` onto `out`: one for a face, one per edge for a face
 * seen edge-on (it holds no area the raster can fill), none for a degenerate triangle.
 */
export function projectTriangle(mesh: MeshData, plane: SectionPlaneConfig, t: number, out: number[]): void {
  const { positions, indices, origin } = mesh;
  const c = CORNER;
  for (let k = 0; k < 3; k++) {
    const p = getVertex(positions, indices[t * 3 + k], origin);
    const q = projectPointForPlane(p, plane);
    c[k * 6] = p.x; c[k * 6 + 1] = p.y; c[k * 6 + 2] = p.z;
    c[k * 6 + 3] = q.x; c[k * 6 + 4] = q.y; c[k * 6 + 5] = -signedDepth(p, plane);
  }
  const u0 = c[3], v0 = c[4], d0 = c[5], u1 = c[9], v1 = c[10], d1 = c[11], u2 = c[15], v2 = c[16], d2 = c[17];
  const e1u = u1 - u0, e1v = v1 - v0, e2u = u2 - u0, e2v = v2 - v0;
  const area2 = e1u * e2v - e2u * e1v;
  const ax = c[6] - c[0], ay = c[7] - c[1], az = c[8] - c[2];
  const bx = c[12] - c[0], by = c[13] - c[1], bz = c[14] - c[2];
  const area3 = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
  if (!(area3 > 0)) return;
  if (Math.abs(area2) <= 1e-3 * area3) {
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      const ui = c[i * 6 + 3], vi = c[i * 6 + 4], di = c[i * 6 + 5], uj = c[j * 6 + 3], vj = c[j * 6 + 4], dj = c[j * 6 + 5];
      if (Math.hypot(uj - ui, vj - vi) === 0) continue;
      out.push(ui, vi, uj, vj, uj, vj, di, dj, 0, EDGE, Math.min(di, dj));
    }
    return;
  }
  const e1d = d1 - d0, e2d = d2 - d0;
  const a = (e1d * e2v - e2d * e1v) / area2;
  const b = (e1u * e2d - e2u * e1d) / area2;
  out.push(u0, v0, u1, v1, u2, v2, a, b, d0 - a * u0 - b * v0, Math.hypot(a, b), Math.min(d0, d1, d2));
}

/** A uniform grid of face bounds (grown by `reach`), so a line looks only at the faces near it. */
export class FaceGrid {
  private readonly cells: number[][];
  private readonly size: number;
  private readonly minU: number;
  private readonly minV: number;
  private readonly cellU: number;
  private readonly cellV: number;
  private readonly seen: Int32Array;
  private stamp = 0;

  constructor(faces: Float64Array, reach: number) {
    const count = faces.length / STRIDE;
    let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
    for (let i = 0; i < faces.length; i += STRIDE) {
      for (let k = 0; k < 6; k += 2) {
        minU = Math.min(minU, faces[i + k]); maxU = Math.max(maxU, faces[i + k]);
        minV = Math.min(minV, faces[i + k + 1]); maxV = Math.max(maxV, faces[i + k + 1]);
      }
    }
    this.size = count > 64 ? Math.min(64, Math.ceil(Math.sqrt(count))) : 1;
    this.minU = minU - reach;
    this.minV = minV - reach;
    this.cellU = Math.max((maxU - minU + 2 * reach) / this.size, 1e-12);
    this.cellV = Math.max((maxV - minV + 2 * reach) / this.size, 1e-12);
    this.cells = Array.from({ length: this.size * this.size }, () => []);
    this.seen = new Int32Array(count);
    for (let f = 0; f < count; f++) {
      const o = f * STRIDE;
      const lo = this.cellRange(Math.min(faces[o], faces[o + 2], faces[o + 4]) - reach, Math.min(faces[o + 1], faces[o + 3], faces[o + 5]) - reach);
      const hi = this.cellRange(Math.max(faces[o], faces[o + 2], faces[o + 4]) + reach, Math.max(faces[o + 1], faces[o + 3], faces[o + 5]) + reach);
      for (let y = lo[1]; y <= hi[1]; y++) for (let x = lo[0]; x <= hi[0]; x++) this.cells[y * this.size + x].push(f);
    }
  }

  private cellRange(u: number, v: number): [number, number] {
    const clamp = (c: number) => Math.max(0, Math.min(this.size - 1, Math.floor(c)));
    return [clamp((u - this.minU) / this.cellU), clamp((v - this.minV) / this.cellV)];
  }

  /** Faces whose grown bounds may meet the box. */
  query(minU: number, minV: number, maxU: number, maxV: number): number[] {
    const lo = this.cellRange(minU, minV);
    const hi = this.cellRange(maxU, maxV);
    const found: number[] = [];
    this.stamp++;
    for (let y = lo[1]; y <= hi[1]; y++) {
      for (let x = lo[0]; x <= hi[0]; x++) {
        for (const f of this.cells[y * this.size + x]) {
          if (this.seen[f] === this.stamp) continue;
          this.seen[f] = this.stamp;
          found.push(f);
        }
      }
    }
    return found;
  }
}
