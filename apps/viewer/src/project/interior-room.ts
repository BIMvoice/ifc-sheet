/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A room's footprint, floor and top from its space geometry, for its interior
 * elevations. Pure: meshes in (the federated geometry the drawings are made
 * from, so the room is in the frame its views are drawn in), a room out.
 */

import { footprintOf } from '@/tagall/footprint';
import type { Pt } from '@/drafting/types';

interface RoomMesh {
  expressId: number;
  ifcType?: string;
  positions: ArrayLike<number>;
  indices: ArrayLike<number>;
  origin?: readonly number[];
}

/** Height above the floor at which a room's footprint is read, metres (under a sloped ceiling, never above half its height). */
export const ROOM_CUT_M = 1;

/** The footprint, floor and top of the space drawn with render id `renderId`; `null` when it has no geometry or no footprint. */
export function roomGeometry(meshes: readonly RoomMesh[], renderId: number): { ring: Pt[]; floor: number; top: number } | null {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const m of meshes) {
    if (m.expressId !== renderId || m.ifcType !== 'IfcSpace') continue;
    const offset = positions.length / 3;
    // A vertex is at `origin + position`: each element keeps its own local frame.
    for (let i = 0; i < m.positions.length; i++) positions.push(m.positions[i] + (m.origin?.[i % 3] ?? 0));
    for (let i = 0; i < m.indices.length; i++) indices.push(m.indices[i] + offset);
  }
  let floor = Infinity, top = -Infinity;
  for (let i = 1; i < positions.length; i += 3) {
    floor = Math.min(floor, positions[i]);
    top = Math.max(top, positions[i]);
  }
  if (!(top > floor)) return null;
  const footprint = footprintOf({ positions, indices }, floor + Math.min(ROOM_CUT_M, (top - floor) / 2), floor);
  return footprint ? { ring: footprint.ring, floor, top } : null;
}

/** How a room is named on its views: number and name ("4 Schlafzimmer"), else whichever it has. */
export function roomLabel(name: string | undefined, longName: string | undefined, fallback: string): string {
  return [name, longName].map((s) => s?.trim()).filter(Boolean).join(' ') || fallback;
}
