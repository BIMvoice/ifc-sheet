/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Sections worth drawing, proposed from what the model already knows: one
 * through the stair (the cut that shows the storeys and how they connect) and
 * one through each room, named after what it passes through, "Through the
 * living room". A set starts with the first two; the rest wait in the tray to
 * be swapped in.
 *
 * Pure: footprints in, cut lines out, all in the viewer's horizontal frame
 * (world X and Z, metres), the frame a plan's drawing coordinates map to.
 */

export interface Footprint {
  min: { x: number; z: number };
  max: { x: number; z: number };
}

export interface RoomFootprint extends Footprint {
  /** What a person calls it: the room's LongName, else its Name. */
  name: string;
  /** What tells it from every other room: its GlobalId, else an express id. Rooms of one name are keyed by it. */
  id?: string;
  /** The storey it is on, as a person reads it; tells rooms of one name apart in the tray. */
  storey?: string;
}

export interface ProposalInput {
  /** The extent the cut line spans: the building's footprint. */
  building: Footprint;
  rooms: readonly RoomFootprint[];
  stairs: readonly Footprint[];
}

export interface SectionProposal {
  /** Unique within a set and stable for the same input: `stair-0`, `room-<id>`. */
  key: string;
  /** "Through the stair", "Through Living Room"; rooms of one name add their storey and, if still alike, a number: "Through Office (Level 2, 1)". Unique within a set. */
  label: string;
  /** What the cut passes through: `stair` or the room's name. */
  through: string;
  /** The cut line's ends and a point on the side the section looks toward. */
  a: { x: number; z: number };
  b: { x: number; z: number };
  side: { x: number; z: number };
}

/** How far the cut line reaches past the building on each side, metres. */
export const CUT_OVERHANG_M = 1;
/** Two cuts closer than this show the same thing; the later one is dropped. */
export const SAME_CUT_M = 0.6;
/** Rooms smaller than this (m²) are not worth a section of their own. */
export const SMALLEST_ROOM_M2 = 2;

/** The part of a label that tells a room from its namesakes: its storey, and its number when the storey is shared too. */
function roomLabels(rooms: readonly RoomFootprint[]): string[] {
  const byName = new Map<string, RoomFootprint[]>();
  for (const r of rooms) byName.set(r.name, [...(byName.get(r.name) ?? []), r]);
  return rooms.map((r) => {
    const same = byName.get(r.name) ?? [];
    if (same.length < 2) return `Through ${r.name}`;
    const sameStorey = same.filter((o) => o.storey === r.storey);
    const parts = [...(r.storey ? [r.storey] : []), ...(sameStorey.length > 1 ? [String(sameStorey.indexOf(r) + 1)] : [])];
    return parts.length ? `Through ${r.name} (${parts.join(', ')})` : `Through ${r.name}`;
  });
}

const area = (f: Footprint): number => (f.max.x - f.min.x) * (f.max.z - f.min.z);
const centre = (f: Footprint): { x: number; z: number } => ({ x: (f.min.x + f.max.x) / 2, z: (f.min.z + f.max.z) / 2 });

/**
 * The cuts, best first. A cut runs across the building's short side, so it
 * shows the depth of the plan and the storeys stacked; it looks along the
 * long side toward its far end. The stair comes first, then rooms by size;
 * a cut too close to one already proposed is dropped.
 */
export function proposeSections(input: ProposalInput): SectionProposal[] {
  const { building } = input;
  const width = building.max.x - building.min.x;
  const depth = building.max.z - building.min.z;
  if (!(width > 0) || !(depth > 0)) return [];
  // Long along X: cuts are lines of constant x, spanning z; else the other way round.
  const alongX = width >= depth;
  const lo = (alongX ? building.min.z : building.min.x) - CUT_OVERHANG_M;
  const hi = (alongX ? building.max.z : building.max.x) + CUT_OVERHANG_M;
  const cutAt = (t: number) => (alongX
    ? { a: { x: t, z: lo }, b: { x: t, z: hi }, side: { x: t + 1, z: (lo + hi) / 2 } }
    : { a: { x: lo, z: t }, b: { x: hi, z: t }, side: { x: (lo + hi) / 2, z: t + 1 } });
  const position = (f: Footprint) => (alongX ? centre(f).x : centre(f).z);

  const out: SectionProposal[] = [];
  const taken: number[] = [];
  const add = (key: string, label: string, through: string, t: number): void => {
    if (taken.some((u) => Math.abs(u - t) < SAME_CUT_M)) return;
    taken.push(t);
    out.push({ key, label, through, ...cutAt(t) });
  };
  input.stairs.forEach((s, i) => add(`stair-${i}`, input.stairs.length > 1 ? `Through the stair (${i + 1})` : 'Through the stair', 'stair', position(s)));
  // Largest first; equal rooms by place and id, so the numbering below does not depend on the order they arrive in.
  const rooms = input.rooms.filter((r) => area(r) >= SMALLEST_ROOM_M2)
    .sort((p, q) => area(q) - area(p) || p.name.localeCompare(q.name) || position(p) - position(q) || (p.id ?? '').localeCompare(q.id ?? ''));
  const labels = roomLabels(rooms);
  const seen = new Map<string, number>();
  const usedKeys = new Set<string>(input.stairs.map((_, i) => `stair-${i}`));
  rooms.forEach((room, i) => {
    // Without an id the key is the name and the room's number among its namesakes.
    const n = (seen.get(room.name) ?? 0) + 1;
    seen.set(room.name, n);
    let key = `room-${room.id ?? `${room.name}-${n}`}`;
    for (let again = 2; usedKeys.has(key); again++) key = `room-${room.id ?? room.name}-${again}`; // two rooms given one id still get two keys
    usedKeys.add(key);
    add(key, labels[i], room.name, position(room));
  });
  // A model with no rooms and no stair still gets a cut: through the middle.
  if (out.length === 0) add('middle', 'Through the middle', 'middle', alongX ? (building.min.x + building.max.x) / 2 : (building.min.z + building.max.z) / 2);
  return out;
}
