/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Contour lines of a terrain TIN (#182): each triangle is sliced at every level (marching triangles) and the pieces are
 * chained into polylines, open where the contour leaves the surface and closed where it comes round to itself. Pure
 * metres, in the frame of the meshes (viewer: x east, z south, y up); the drawing step (`contour-drawing.ts`) projects
 * the result onto a plan.
 *
 * A vertex exactly on a level counts as above it, so a contour never runs along a triangle edge twice and every crossing
 * lies strictly inside an edge. Levels are the multiples of the interval, counted from datum 0, and every
 * {@link CONTOUR_MAJOR_EVERY}th is a major contour.
 *
 * File data bounds every loop: the levels per surface ({@link MAX_CONTOUR_LEVELS}), and the chaining marks each segment
 * once, so it takes at most one step per segment.
 */

import type { MeshData } from '@ifc-lite/geometry';
import { isTerrainPredefinedType } from './terrain.js';

/** The interval a view draws when it names none, metres. */
export const CONTOUR_DEFAULT_INTERVAL = 0.5;
/** Every this many levels, the contour is a major one (heavier pen). */
export const CONTOUR_MAJOR_EVERY = 5;
/** The most levels one surface is contoured at: a smaller interval than this gives is coarsened, not refused. */
export const MAX_CONTOUR_LEVELS = 1000;

/** A contour of one height. `points` are metres in the mesh frame (x, z); `closed`: the last point joins the first. */
export interface ContourLine {
  /** Height of the contour (the mesh frame's y plus the datum). */
  height: number;
  major: boolean;
  closed: boolean;
  points: { x: number; z: number }[];
}

/**
 * Whether a mesh is a terrain surface the engine contours by itself: an IfcGeographicElement (what a LandXML terrain becomes in IFC)
 * of PredefinedType TERRAIN, NOTDEFINED or none (`isTerrainPredefinedType`). `predefinedTypeOf` reads the element's PredefinedType;
 * without it the mesh counts as one that states none.
 */
export const isTerrainMesh = (mesh: Pick<MeshData, 'ifcType' | 'expressId'>, predefinedTypeOf?: (expressId: number) => string | null): boolean =>
  mesh.ifcType?.toUpperCase() === 'IFCGEOGRAPHICELEMENT' && isTerrainPredefinedType(predefinedTypeOf?.(mesh.expressId) ?? null);

/** The levels of a surface spanning `min`..`max`: `index * interval`, `index` counted from datum 0, so levels agree between surfaces. */
export function contourLevels(min: number, max: number, interval: number): { index: number; height: number; major: boolean }[] {
  if (!(interval > 0) || !Number.isFinite(min) || !Number.isFinite(max) || max < min) return [];
  // A hairline interval would be thousands of levels: coarsen it to a whole multiple that fits.
  const step = Math.max(interval, (max - min) / MAX_CONTOUR_LEVELS);
  const first = Math.ceil(min / step);
  const last = Math.floor(max / step);
  const out: { index: number; height: number; major: boolean }[] = [];
  for (let index = first; index <= last && out.length < MAX_CONTOUR_LEVELS; index++) {
    out.push({ index, height: index * step, major: index % CONTOUR_MAJOR_EVERY === 0 });
  }
  return out;
}

interface Segment { a: string; b: string; pa: { x: number; z: number }; pb: { x: number; z: number } }

/** A crossing point's key: positions within a tenth of a millimetre are one point, so triangles (and meshes) that share an edge meet. */
const keyOf = (x: number, z: number): string => `${Math.round(x * 1e4)}:${Math.round(z * 1e4)}`;

/** The pieces of a level's segments joined end to end: open chains first (from a free end), then the loops. */
function chain(segments: readonly Segment[]): { points: { x: number; z: number }[]; closed: boolean }[] {
  const at = new Map<string, number[]>();
  segments.forEach((s, i) => {
    for (const k of [s.a, s.b]) {
      const list = at.get(k);
      if (list) list.push(i);
      else at.set(k, [i]);
    }
  });
  const used = new Uint8Array(segments.length);
  const out: { points: { x: number; z: number }[]; closed: boolean }[] = [];
  const walk = (first: number, startKey: string): void => {
    used[first] = 1;
    const s = segments[first];
    const startsAtA = s.a === startKey;
    const points = [startsAtA ? s.pa : s.pb, startsAtA ? s.pb : s.pa];
    let node = startsAtA ? s.b : s.a;
    for (;;) {
      const next = (at.get(node) ?? []).find((i) => !used[i]);
      if (next === undefined) break;
      used[next] = 1;
      const n = segments[next];
      const forward = n.a === node;
      points.push(forward ? n.pb : n.pa);
      node = forward ? n.b : n.a;
    }
    const closed = node === startKey && points.length > 3;
    if (closed) points.pop();
    out.push({ points, closed });
  };
  segments.forEach((s, i) => {
    if (used[i]) return;
    // A free end (a key only one segment touches) starts an open chain.
    const free = [s.a, s.b].find((k) => at.get(k)?.length === 1);
    if (free !== undefined) walk(i, free);
  });
  segments.forEach((s, i) => { if (!used[i]) walk(i, s.a); });
  return out;
}

/**
 * The contours of `meshes` (the terrain surfaces) at every multiple of `interval` between each surface's lowest and
 * highest vertex. `datum` is added to the mesh frame's y to read a height (the render frame's shift from true elevation);
 * levels, and so the contours, are of the height, not of the frame. Empty for an interval that is not positive.
 */
export function contourLines(meshes: readonly Pick<MeshData, 'positions' | 'indices' | 'origin'>[], interval: number, datum = 0): ContourLine[] {
  const out: ContourLine[] = [];
  for (const mesh of meshes) {
    const { positions, indices } = mesh;
    const [ox, oy, oz] = mesh.origin ?? [0, 0, 0];
    const count = Math.floor(positions.length / 3);
    let lo = Infinity;
    let hi = -Infinity;
    for (let v = 0; v < count; v++) {
      const y = positions[v * 3 + 1] + oy + datum;
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    }
    for (const level of contourLevels(lo, hi, interval)) {
      const segments: Segment[] = [];
      for (let t = 0; t + 2 < indices.length; t += 3) {
        const corner = [indices[t], indices[t + 1], indices[t + 2]];
        if (corner.some((v) => v >= count)) continue;
        const h = corner.map((v) => positions[v * 3 + 1] + oy + datum);
        const above = h.map((y) => y >= level.height);
        if (above[0] === above[1] && above[1] === above[2]) continue;
        // Each edge whose ends lie on opposite sides is crossed once; a slice of a triangle crosses exactly two.
        const crossings: { x: number; z: number }[] = [];
        for (let e = 0; e < 3; e++) {
          const f = (e + 1) % 3;
          if (above[e] === above[f]) continue;
          const u = (level.height - h[e]) / (h[f] - h[e]);
          const pe = corner[e] * 3;
          const pf = corner[f] * 3;
          crossings.push({ x: ox + positions[pe] + (positions[pf] - positions[pe]) * u, z: oz + positions[pe + 2] + (positions[pf + 2] - positions[pe + 2]) * u });
        }
        if (crossings.length !== 2) continue;
        const [pa, pb] = crossings;
        const a = keyOf(pa.x, pa.z);
        const b = keyOf(pb.x, pb.z);
        if (a !== b) segments.push({ a, b, pa, pb });
      }
      for (const piece of chain(segments)) out.push({ height: level.height, major: level.major, closed: piece.closed, points: piece.points });
    }
  }
  return out;
}
