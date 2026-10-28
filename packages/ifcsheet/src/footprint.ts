/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A room's footprint on a plan, from its space geometry: the mesh cut by the
 * plan's horizontal plane (the same height the walls are cut at), or, where
 * the space does not reach that height, at its base. The viewer is Y-up, a
 * plan reads (x, z) as its (x, y). Pure: triangles in, rings out. The engine
 * owns it so the app's room tags and the room fills of a coloured plan (#92,
 * `colour-fills.ts`) read the same footprints.
 */

/** A point on the plan. */
export interface Pt {
  x: number;
  y: number;
}

export interface SpaceMesh {
  positions: ArrayLike<number>;
  indices: ArrayLike<number>;
}

export interface Footprint {
  /** The outline, the biggest loop the cut makes. */
  ring: Pt[];
  /** Where the outline came from. */
  at: 'cut' | 'base';
}

/** Distance above the lowest point of a space at which its base is read (metres). */
const BASE_OFFSET = 0.05;
const KEY = 1e4;

const keyOf = (p: Pt) => `${Math.round(p.x * KEY)},${Math.round(p.y * KEY)}`;

/** The segments in which the plane `y = level` cuts the triangles, as plan points. */
function cutSegments(mesh: SpaceMesh, level: number): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  const pos = mesh.positions, idx = mesh.indices;
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const v = [idx[t], idx[t + 1], idx[t + 2]].map((i) => ({ x: pos[i * 3], y: pos[i * 3 + 1], z: pos[i * 3 + 2] }));
    const hits: Pt[] = [];
    for (let k = 0; k < 3; k++) {
      const a = v[k], b = v[(k + 1) % 3];
      // A vertex exactly on the plane counts as above it, so each crossing is found once.
      if ((a.y < level) === (b.y < level)) continue;
      const s = (level - a.y) / (b.y - a.y);
      hits.push({ x: a.x + (b.x - a.x) * s, y: a.z + (b.z - a.z) * s });
    }
    if (hits.length === 2 && keyOf(hits[0]) !== keyOf(hits[1])) out.push([hits[0], hits[1]]);
  }
  return out;
}

/** Joins segments end to end into closed loops. */
function loopsOf(segments: readonly [Pt, Pt][]): Pt[][] {
  const at = new Map<string, number[]>();
  segments.forEach(([a, b], i) => {
    for (const p of [a, b]) at.set(keyOf(p), [...(at.get(keyOf(p)) ?? []), i]);
  });
  const used = new Set<number>();
  const loops: Pt[][] = [];
  segments.forEach((_, start) => {
    if (used.has(start)) return;
    const loop: Pt[] = [];
    let i: number | undefined = start;
    let from: Pt = segments[start][0];
    while (i !== undefined && !used.has(i)) {
      used.add(i);
      const [a, b]: [Pt, Pt] = segments[i];
      const next: Pt = keyOf(a) === keyOf(from) ? b : a;
      loop.push(from);
      from = next;
      i = (at.get(keyOf(next)) ?? []).find((j) => !used.has(j));
    }
    if (loop.length >= 3 && keyOf(from) === keyOf(loop[0])) loops.push(loop);
  });
  return loops;
}

export const ringArea = (ring: readonly Pt[]): number => Math.abs(ring.reduce((s, p, i) => { const q = ring[(i + 1) % ring.length]; return s + p.x * q.y - q.x * p.y; }, 0)) / 2;

/** How far below the plan's floor a space may start and still belong to the plan's storey (metres). */
const FLOOR_TOLERANCE = 0.3;

/**
 * The footprint of a space at the plane `y = level` (the cut); else, for a space of this plan's storey (it starts at
 * `floor`, give or take) that ends below the cut, just above its lowest point (the base). Null when it has none.
 */
export function footprintOf(mesh: SpaceMesh, level: number, floor: number = level): Footprint | null {
  const biggest = (loops: Pt[][]) => loops.sort((a, b) => ringArea(b) - ringArea(a))[0];
  const cut = biggest(loopsOf(cutSegments(mesh, level)));
  if (cut) return { ring: cut, at: 'cut' };
  let low = Infinity, high = -Infinity;
  for (let i = 1; i < mesh.positions.length; i += 3) {
    low = Math.min(low, mesh.positions[i]);
    high = Math.max(high, mesh.positions[i]);
  }
  if (!Number.isFinite(low) || low < floor - FLOOR_TOLERANCE || high >= level) return null;
  const base = biggest(loopsOf(cutSegments(mesh, low + BASE_OFFSET)));
  return base ? { ring: base, at: 'base' } : null;
}

export interface RoomFootprint extends Footprint {
  renderId: number;
}

/** The footprints of the spaces among `meshes` on the plan cut at `level`, whose floor is at `floor`; one entry per space, ordered by id. */
export function roomFootprints(meshes: readonly (SpaceMesh & { expressId: number; ifcType?: string; origin?: readonly number[] })[], level: number, floor: number): RoomFootprint[] {
  const byId = new Map<number, { positions: number[]; indices: number[] }>();
  for (const m of meshes) {
    if (m.ifcType !== 'IfcSpace') continue;
    const into = byId.get(m.expressId) ?? { positions: [], indices: [] };
    const offset = into.positions.length / 3;
    // A vertex is at `origin + position`: each element keeps its own local frame.
    for (let i = 0; i < m.positions.length; i++) into.positions.push(m.positions[i] + (m.origin?.[i % 3] ?? 0));
    for (let i = 0; i < m.indices.length; i++) into.indices.push(m.indices[i] + offset);
    byId.set(m.expressId, into);
  }
  return [...byId].sort((a, b) => a[0] - b[0]).flatMap(([renderId, mesh]) => {
    const f = footprintOf(mesh, level, floor);
    return f ? [{ renderId, ...f }] : [];
  });
}
