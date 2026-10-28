/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The one place a room's area is decided (#42): the urban indicators' Au, the
 * room and area schedule and the room labels all read it, in the app and on
 * the command line, so the figures cannot disagree.
 *
 * - Which IfcSpace is a room (`spaceRole`): every space except an EXTERNAL one
 *   (balcony, terrace), a GFA one (an area-scheme space) and a space that
 *   aggregates spaces of its own (only the leaves are rooms, so nothing is
 *   counted twice). INTERNAL, NOTDEFINED, unset, SPACE, PARKING and USERDEFINED
 *   all count: most tools type an ordinary room SPACE.
 * - Its area (`roomArea`): NetFloorArea, else GrossFloorArea, from
 *   `Qto_SpaceBaseQuantities` first and then any quantity set (ArchiCAD writes
 *   them to `BaseQuantities`), in square metres; when the model states neither,
 *   the footprint of the space's own geometry (`meshFootprintArea`). The result
 *   says which of the two it is (`source`), and a caller that prints the area
 *   says so.
 * - Its perimeter (`meshFootprintPerimeter`): the outline of that same footprint, from the geometry alone (the area may be
 *   the model's own figure; the model's Perimeter quantity is not read).
 */

import { QuantityType, type QuantitySet } from '@ifc-lite/data';

/** The standard set a space's quantities are in. */
export const ROOM_AREA_QTO = 'Qto_SpaceBaseQuantities';
/** The quantities a room's area is read from, in order of preference. */
export const ROOM_AREA_NAMES: readonly string[] = ['NetFloorArea', 'GrossFloorArea'];

/** The first of `names` found, preferring the set named `preferred`; in SI (`siScale` converts the model's area unit). */
export function pickArea(qsets: readonly QuantitySet[], preferred: string, names: readonly string[], siScale: number): number | null {
  const ordered = [...qsets.filter((s) => s.name === preferred), ...qsets.filter((s) => s.name !== preferred)];
  for (const name of names) {
    for (const set of ordered) {
      const q = set.quantities.find((x) => x.name === name && x.type === QuantityType.Area && Number.isFinite(x.value));
      if (q) return q.value * siScale;
    }
  }
  return null;
}

export type SpaceRole = 'room' | 'external' | 'gfa' | 'parent';

/** What an IfcSpace is for the areas: a room, or one of the three kinds that are not (`PredefinedType` without dots, any case). */
export function spaceRole(predefinedType: string, aggregatesSpaces: boolean): SpaceRole {
  const kind = predefinedType.replace(/\./g, '').toUpperCase();
  if (kind === 'EXTERNAL') return 'external';
  if (kind === 'GFA') return 'gfa';
  return aggregatesSpaces ? 'parent' : 'room';
}

export type AreaSource = 'quantity' | 'geometry';

export interface RoomArea {
  /** m²; null when the model states none and the space has no usable geometry. */
  area: number | null;
  source: AreaSource | null;
}

/** The mesh a footprint is taken from: positions in metres, Y up (the viewer frame), indices into them. */
export interface FootprintMesh {
  positions: ArrayLike<number>;
  indices: ArrayLike<number>;
}

/**
 * The floor area of a closed solid, m²: the sum of the triangles' areas projected on the horizontal plane, halved
 * (every point of the footprint is covered once by a face facing up and once by one facing down). Zero for a mesh
 * that is not a solid or has no triangle.
 */
export function meshFootprintArea(meshes: readonly FootprintMesh[]): number {
  let twice = 0;
  for (const { positions: p, indices: ix } of meshes) {
    for (let i = 0; i + 2 < ix.length; i += 3) {
      const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
      // Horizontal plane of the viewer frame: x and z.
      twice += Math.abs((p[b] - p[a]) * (p[c + 2] - p[a + 2]) - (p[c] - p[a]) * (p[b + 2] - p[a + 2])) / 2;
    }
  }
  return twice / 2;
}

/** A millimetre: two vertices closer than this are one in a footprint's outline. */
const OUTLINE_GRID = 1000;

type Corner = readonly [number, number];

/**
 * The length of a closed solid's footprint outline, metres: the boundary of the same projection `meshFootprintArea` measures
 * (courtyards of the footprint included). Each projected triangle is turned to face one way and its edges are added with a
 * direction; an edge two faces share on the plan, one on each side (a fold of the solid), cancels, and what stays is the
 * outline: the edges the top and the bottom of the solid both lie on the same side of. Faces standing upright project to
 * nothing and are skipped. An edge is first cut at every vertex that lies on it, since the top and the bottom are not
 * triangulated alike (a groove in the ceiling puts corners on a wall's line that the floor does not have). Measured from
 * the geometry, not its bounding box: a U-shaped room has a longer outline than its box.
 */
export function meshFootprintPerimeter(meshes: readonly FootprintMesh[]): number {
  const triangles: (readonly [Corner, Corner, Corner])[] = [];
  const vertices = new Map<string, Corner>();
  for (const { positions: p, indices: ix } of meshes) {
    for (let i = 0; i + 2 < ix.length; i += 3) {
      const c = [0, 1, 2].map((k): Corner => [Math.round(p[ix[i + k] * 3] * OUTLINE_GRID), Math.round(p[ix[i + k] * 3 + 2] * OUTLINE_GRID)]);
      const turn = (c[1][0] - c[0][0]) * (c[2][1] - c[0][1]) - (c[2][0] - c[0][0]) * (c[1][1] - c[0][1]);
      if (turn === 0) continue;
      const ring: readonly [Corner, Corner, Corner] = turn > 0 ? [c[0], c[1], c[2]] : [c[0], c[2], c[1]];
      triangles.push(ring);
      for (const v of ring) vertices.set(`${v[0]},${v[1]}`, v);
    }
  }
  const byX = [...vertices.values()].sort((a, b) => a[0] - b[0]);
  const firstFrom = (x: number): number => { let lo = 0, hi = byX.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (byX[mid][0] < x) lo = mid + 1; else hi = mid; } return lo; };
  /** The corners from `a` to `b` (a before b along the edge): `a`, every vertex lying strictly between them, `b`. */
  const cut = (a: Corner, b: Corner): Corner[] => {
    const on: { v: Corner; t: number }[] = [];
    const [dx, dz] = [b[0] - a[0], b[1] - a[1]];
    const [loZ, hiZ] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
    for (let k = firstFrom(Math.min(a[0], b[0])); k < byX.length && byX[k][0] <= Math.max(a[0], b[0]); k++) {
      const v = byX[k];
      if (v[1] < loZ || v[1] > hiZ || dx * (v[1] - a[1]) - dz * (v[0] - a[0]) !== 0) continue;
      const t = (v[0] - a[0]) * dx + (v[1] - a[1]) * dz;
      if (t > 0 && t < dx * dx + dz * dz) on.push({ v, t });
    }
    return [a, ...on.sort((m, n) => m.t - n.t).map((o) => o.v), b];
  };
  const pieces = new Map<string, Corner[]>();
  const segments = new Map<string, { net: number; length: number }>();
  for (const ring of triangles) {
    for (let k = 0; k < 3; k++) {
      const [a, b] = [ring[k], ring[(k + 1) % 3]];
      const forward = a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
      const [lo, hi] = forward ? [a, b] : [b, a];
      const edge = `${lo[0]},${lo[1]},${hi[0]},${hi[1]}`;
      const along = pieces.get(edge) ?? pieces.set(edge, cut(lo, hi)).get(edge)!;
      for (let m = 0; m + 1 < along.length; m++) {
        const key = `${along[m][0]},${along[m][1]},${along[m + 1][0]},${along[m + 1][1]}`;
        const seg = segments.get(key) ?? { net: 0, length: Math.hypot(along[m + 1][0] - along[m][0], along[m + 1][1] - along[m][1]) / OUTLINE_GRID };
        seg.net += forward ? 1 : -1;
        segments.set(key, seg);
      }
    }
  }
  let total = 0;
  for (const { net, length } of segments.values()) if (net !== 0) total += length;
  return total;
}

/**
 * A room's area: the model's own figure (`pickArea` over its quantity sets, scaled by `areaScale`), else the footprint
 * of its geometry when `footprint` gives one. A zero or negative figure from the model is not an area and is passed over.
 */
export function roomArea(qsets: readonly QuantitySet[], areaScale: number, footprint?: () => number | null): RoomArea {
  const stated = pickArea(qsets, ROOM_AREA_QTO, ROOM_AREA_NAMES, areaScale);
  if (stated !== null && stated > 0) return { area: stated, source: 'quantity' };
  const measured = footprint?.() ?? null;
  return measured !== null && Number.isFinite(measured) && measured > 0 ? { area: measured, source: 'geometry' } : { area: null, source: null };
}
