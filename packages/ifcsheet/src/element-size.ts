/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The size of ONE door or window read off its mesh, in the element's own frame (#485): the horizontal rectangle of least area around the
 * vertices gives the width axis and the wall normal, so a window turned in the plan measures the same as one along an axis. It is what the
 * joinery schedule prints for an element whose IFC states no OverallWidth / OverallHeight (a non-parametric window, as Bonsai exports),
 * and what the element views are cut in (`element-views.ts` of the app reads the same frame), so the schedule and the drawing agree.
 */

import type { MeshData } from '@ifc-lite/geometry';

/** The element's meshes with their per-element `origin` folded into the positions (world = origin + position) and the instancing templates (`geometryClass` 2) left out. */
export function placedMeshes(meshes: readonly MeshData[]): MeshData[] {
  return meshes.filter((m) => (m.geometryClass ?? 0) !== 2).map((m) => {
    const [ox, oy, oz] = m.origin ?? [0, 0, 0];
    if (!ox && !oy && !oz) return m;
    const positions = new Float32Array(m.positions.length);
    for (let i = 0; i + 2 < positions.length; i += 3) {
      positions[i] = m.positions[i] + ox; positions[i + 1] = m.positions[i + 1] + oy; positions[i + 2] = m.positions[i + 2] + oz;
    }
    return { ...m, positions, origin: [0, 0, 0] };
  });
}

/** The tightest footprint rectangle of an element's vertices (viewer world, y up), metres. `c`, `s` turn x and z into the rectangle's axes. */
export interface FootprintFit {
  /** The long side of the footprint. */
  width: number;
  /** The short side: across the wall. */
  depth: number;
  /** The lowest to the highest vertex. */
  height: number;
  minY: number;
  /** Whether the long side runs along the fit's first axis `(c, s)`; `ox`/`oz` is the footprint's middle. */
  wide: boolean;
  c: number;
  s: number;
  ox: number;
  oz: number;
}

/** The frame of the meshes `placed` (`placedMeshes`); null when they have no vertex. */
export function fitFootprint(placed: readonly MeshData[]): FootprintFit | null {
  let n = 0, minY = Infinity, maxY = -Infinity;
  for (const m of placed) {
    for (let i = 0; i + 2 < m.positions.length; i += 3) {
      n++;
      minY = Math.min(minY, m.positions[i + 1]);
      maxY = Math.max(maxY, m.positions[i + 1]);
    }
  }
  if (n === 0) return null;
  interface Fit { area: number; deg: number; u0: number; u1: number; v0: number; v1: number }
  const fit = (deg: number): Fit => {
    const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const m of placed) {
      for (let i = 0; i + 2 < m.positions.length; i += 3) {
        const x = m.positions[i], z = m.positions[i + 2];
        const u = x * c + z * s, v = -x * s + z * c;
        if (u < u0) u0 = u; if (u > u1) u1 = u;
        if (v < v0) v0 = v; if (v > v1) v1 = v;
      }
    }
    return { area: (u1 - u0) * (v1 - v0), deg, u0, u1, v0, v1 };
  };
  const tightest = (degs: Iterable<number>, from: Fit | null): Fit | null => {
    let best = from;
    for (const deg of degs) { const f = fit(deg); if (!best || f.area < best.area - 1e-12) best = f; }
    return best;
  };
  // A degree at a time, then a twentieth of one around the best.
  const coarse = tightest(Array.from({ length: 90 }, (_, d) => d), null);
  const best = coarse && tightest(Array.from({ length: 41 }, (_, d) => coarse.deg + (d - 20) / 20), coarse);
  if (!best) return null;
  const c = Math.cos((best.deg * Math.PI) / 180), s = Math.sin((best.deg * Math.PI) / 180);
  const wide = best.u1 - best.u0 >= best.v1 - best.v0;
  const cu = (best.u0 + best.u1) / 2, cv = (best.v0 + best.v1) / 2;
  return {
    width: wide ? best.u1 - best.u0 : best.v1 - best.v0, depth: wide ? best.v1 - best.v0 : best.u1 - best.u0, height: maxY - minY, minY,
    wide, c, s, ox: cu * c - cv * s, oz: cu * s + cv * c,
  };
}

/** The width and height (metres) of an element from its meshes, in its own frame; null when it has no usable geometry or a side measures nothing. */
export function measureElementSize(meshes: readonly MeshData[] | undefined): { width: number; height: number } | null {
  const frame = meshes?.length ? fitFootprint(placedMeshes(meshes)) : null;
  if (!frame || !(frame.width > 0) || !(frame.height > 0) || !Number.isFinite(frame.width) || !Number.isFinite(frame.height)) return null;
  return { width: frame.width, height: frame.height };
}

/** `(expressId) => meshes` over a headless model's meshes (`OpenedModel.meshes`), grouped once on first use; instancing templates are never an element's. */
export function meshesByExpressId(meshes: readonly MeshData[]): (expressId: number) => readonly MeshData[] | undefined {
  let byId: Map<number, MeshData[]> | null = null;
  return (expressId) => {
    if (!byId) {
      byId = new Map();
      for (const m of meshes) {
        if ((m.geometryClass ?? 0) === 2) continue;
        const list = byId.get(m.expressId);
        if (list) list.push(m); else byId.set(m.expressId, [m]);
      }
    }
    return byId.get(expressId);
  };
}
