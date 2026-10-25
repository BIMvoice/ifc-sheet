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
