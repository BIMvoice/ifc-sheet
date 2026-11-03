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
  /** The walls of the level, as footprints. A cut is kept off the thickness of a wall: a line that runs along a wall draws almost nothing (#665). Without them a cut stays where the room or stair is centred. */
  walls?: readonly Footprint[];
}

export interface SectionProposal {
  /** Unique within a set and stable for the same input: `stair-0`, `room-<id>`; `long-` before those of the cuts along the building's long side. */
  key: string;
  /** "Through the stair", "Through Living Room", with ", lengthwise" after those that run along the building's long side; rooms of one name add their storey and, if still alike, a number: "Through Office (Level 2, 1)". Unique within a set. */
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

/** The classes whose footprints go into `ProposalInput.walls`, upper case as the data store has them; the app and the command line read the same. */
export const PROPOSAL_WALL_TYPES: readonly string[] = ['IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCWALLELEMENTEDCASE'];
/** A wall footprint thinner than this across the cut is a wall seen edge on; a cut inside it runs along the wall. */
export const WALL_THICKNESS_MAX_M = 0.6;
/** How far a cut keeps from the face of a wall it runs beside, metres. */
export const WALL_CLEARANCE_M = 0.3;

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

/** Where a cut at `t` (a constant coordinate on `axis`) runs along a wall: inside the thin side of a wall that is longer the way the cut runs. */
function alongWall(walls: readonly Footprint[], axis: 'x' | 'z', t: number): boolean {
  const other = axis === 'x' ? 'z' : 'x';
  return walls.some((w) => {
    const thick = w.max[axis] - w.min[axis];
    return thick <= WALL_THICKNESS_MAX_M && w.max[other] - w.min[other] > thick && t > w.min[axis] - WALL_CLEARANCE_M && t < w.max[axis] + WALL_CLEARANCE_M;
  });
}

/** The cut position nearest the middle of `[lo, hi]` that is not along a wall; the middle when every position is. Steps of 5 cm, so the answer is the same on every run. */
function clearOfWalls(walls: readonly Footprint[], axis: 'x' | 'z', lo: number, hi: number): number {
  const mid = (lo + hi) / 2;
  const reach = (hi - lo) / 2 - Math.min(0.2, (hi - lo) / 4);
  for (let k = 0; k * 0.05 <= reach; k++) {
    for (const t of k === 0 ? [mid] : [mid - k * 0.05, mid + k * 0.05]) if (!alongWall(walls, axis, t)) return t;
  }
  return mid;
}

interface Thing { key: string; label: string; through: string; f: Footprint }

/**
 * The cuts, best first. The first is across the building's short side, so it
 * shows the depth of the plan and the storeys stacked; the second runs the
 * other way, along the long side, so the two starting sections look in
 * different directions (#665). Each looks toward the far end. The stair comes
 * first, then rooms by size; the second cut starts at the next thing, so the
 * two do not show the same room. A cut too close to one already proposed in
 * its direction is dropped, and none is left to run along a wall. The rest
 * follow, short-side cuts first.
 */
export function proposeSections(input: ProposalInput): SectionProposal[] {
  const { building } = input;
  const width = building.max.x - building.min.x;
  const depth = building.max.z - building.min.z;
  if (!(width > 0) || !(depth > 0)) return [];
  const walls = input.walls ?? [];
  // Long along X: the short-side cuts are lines of constant x, spanning z; else the other way round.
  const alongX = width >= depth;
  const things: Thing[] = input.stairs.map((s, i) => ({ key: `stair-${i}`, label: input.stairs.length > 1 ? `Through the stair (${i + 1})` : 'Through the stair', through: 'stair', f: s }));
  // Largest first; equal rooms by place and id, so the numbering below does not depend on the order they arrive in.
  const position = (f: Footprint) => (alongX ? centre(f).x : centre(f).z);
  const rooms =input.rooms.filter((r) => area(r) >= SMALLEST_ROOM_M2)
    .sort((p, q) => area(q) - area(p) || p.name.localeCompare(q.name) || position(p) - position(q) || (p.id ?? '').localeCompare(q.id ?? ''));
  const labels = roomLabels(rooms);
  const seen = new Map<string, number>();
  const usedKeys = new Set<string>(things.map((t) => t.key));
  rooms.forEach((room, i) => {
    // Without an id the key is the name and the room's number among its namesakes.
    const n = (seen.get(room.name) ?? 0) + 1;
    seen.set(room.name, n);
    let key = `room-${room.id ?? `${room.name}-${n}`}`;
    for (let again = 2; usedKeys.has(key); again++) key = `room-${room.id ?? room.name}-${again}`; // two rooms given one id still get two keys
    usedKeys.add(key);
    things.push({ key, label: labels[i], through: room.name, f: room });
  });
  // A model with no rooms and no stair still gets a cut each way: through the middle.
  if (things.length === 0) things.push({ key: 'middle', label: 'Through the middle', through: 'middle', f: building });

  /** The cuts in one direction, over `order`: across the short side, else along the long side. */
  const cuts = (across: boolean, order: readonly Thing[]): SectionProposal[] => {
    // A cut across the short side is a line of constant x when the building is long along x.
    const axis: 'x' | 'z' = across === alongX ? 'x' : 'z';
    const span: 'x' | 'z' = axis === 'x' ? 'z' : 'x';
    const lo = building.min[span] - CUT_OVERHANG_M;
    const hi = building.max[span] + CUT_OVERHANG_M;
    const cutAt = (t: number) => (axis === 'x'
      ? { a: { x: t, z: lo }, b: { x: t, z: hi }, side: { x: t + 1, z: (lo + hi) / 2 } }
      : { a: { x: lo, z: t }, b: { x: hi, z: t }, side: { x: (lo + hi) / 2, z: t + 1 } });
    const out: SectionProposal[] = [];
    const taken: number[] = [];
    for (const thing of order) {
      const t = clearOfWalls(walls, axis, thing.f.min[axis], thing.f.max[axis]);
      if (taken.some((u) => Math.abs(u - t) < SAME_CUT_M)) continue;
      taken.push(t);
      out.push({ key: across ? thing.key : `long-${thing.key}`, label: across ? thing.label : `${thing.label}, lengthwise`, through: thing.through, ...cutAt(t) });
    }
    return out;
  };
  const shortSide = cuts(true, things);
  // The second cut starts at the next thing, so it does not pass through what the first does.
  const lengthwise = cuts(false, things.length > 1 ? [...things.slice(1), things[0]] : things);
  return [shortSide[0], lengthwise[0], ...shortSide.slice(1), ...lengthwise.slice(1)].filter((p): p is SectionProposal => p !== undefined);
}
