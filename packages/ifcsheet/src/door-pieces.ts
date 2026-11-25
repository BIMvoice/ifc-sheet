/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One wall gap, one door symbol. Some models carry the pieces of a door as IfcDoor objects of their own: ArchiCAD's schependomlaan
 * has, beside each door (`merk F-R`, an IfcDoor that fills the wall's IfcOpeningElement), its sub-frame (`stelkozijn`) and its
 * lining as separate IfcDoors in the same gap. A plan drew a swing for each, so one door showed two or three leaves and arcs.
 *
 * What tells the piece from the door is what the model states: the door is hosted (`openingHostsOf`: it fills an opening that voids
 * a wall, or a curtain wall aggregates it), the piece is hosted in nothing. So a door hosted in nothing whose footprint lies in the
 * gap of a hosted door is a piece of it and is not drawn. Two hosted doors in one gap are both kept (the model states both), and so
 * are doors hosted in nothing that share a gap only with each other (nothing says which is the door). The two leaves of a double
 * door lie side by side, not in one gap, so neither is ever taken for the other's piece.
 */

import type { OpeningRect } from './opening-symbols.js';

/** How far two footprints' widths may turn from each other and still be one gap: 10°. */
const PARALLEL = Math.cos(Math.PI / 18);
/** How far a piece's middle line may lie off the door's band, beyond the thicker one's half depth, metres: a sub-frame sits on the wall face. */
const ACROSS = 0.1;

/**
 * Whether the footprint `piece` lies in the gap of the footprint `door`: their widths run the same way, the piece's middle line lies within the
 * door's band (the thicker one's half depth, plus `ACROSS`), and along the width they overlap by more than half the narrower one.
 */
export function inSameGap(piece: OpeningRect, door: OpeningRect): boolean {
  if (Math.abs(piece.u.x * door.u.x + piece.u.y * door.u.y) < PARALLEL) return false;
  const dx = piece.c.x - door.c.x, dy = piece.c.y - door.c.y;
  if (Math.abs(dx * door.n.x + dy * door.n.y) > Math.max(piece.depth, door.depth) / 2 + ACROSS) return false;
  const along = dx * door.u.x + dy * door.u.y;
  const overlap = Math.min(door.width / 2, along + piece.width / 2) - Math.max(-door.width / 2, along - piece.width / 2);
  return overlap > Math.min(piece.width, door.width) / 2;
}

/**
 * The doors of `ids` that are pieces of another: hosted in nothing (`hosted` false), with a footprint (`readOf`) in the gap of a hosted door's.
 * Footprints are read only when some door is hosted in nothing.
 */
export function doorPieces(ids: readonly number[], readOf: (id: number) => OpeningRect | null, hosted: (id: number) => boolean): Set<number> {
  const pieces = new Set<number>();
  const loose = ids.filter((id) => !hosted(id));
  if (loose.length === 0) return pieces;
  const doors = ids.filter(hosted).map(readOf).filter((r) => r !== null);
  for (const id of loose) {
    const read = readOf(id);
    if (read && doors.some((door) => inSameGap(read, door))) pieces.add(id);
  }
  return pieces;
}
