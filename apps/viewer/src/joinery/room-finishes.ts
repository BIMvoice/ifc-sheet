/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The room finishes schedule: for each room (IfcSpace), the floor, wall and
 * ceiling finishes with their areas, read from the model's own coverings and
 * quantity sets, never measured off the geometry.
 *
 * A covering belongs to a room by the first of these relations that gives the
 * room a covering of that surface (each surface falls back on its own):
 *   1. IfcRelCoversSpaces (the standard link from IfcCovering to IfcSpace),
 *   2. IfcRelSpaceBoundary (the covering as the related building element),
 *   3. IfcRelContainedInSpatialStructure with the space as the structure,
 *   4. the room's Pset_SpaceCoveringRequirements (FloorCovering, WallCovering,
 *      CeilingCovering): a name only, no area.
 * The surface comes from the covering's PredefinedType, or its IfcCoveringType's
 * when the covering's own is NOTDEFINED or unset: FLOORING is floor; CLADDING,
 * SKIRTINGBOARD and MOLDING are wall; CEILING is ceiling. Any other value
 * (ROOFING, INSULATION, MEMBRANE, SLEEVING, WRAPPING, COPING, USERDEFINED,
 * NOTDEFINED) is not a room finish and is left out.
 *
 * A covering that more than one room uses for a surface has its area split
 * equally between those rooms: the relations above say which rooms a covering
 * finishes, never how much of it each room has, so an equal share is the only
 * split they support. The schedule marks such areas and says so in a note.
 *
 * Pure: rooms in, rows out. `collectRoomInputs` reads the loaded models into
 * that input.
 */

import { QuantityType, type QuantitySet } from '@ifc-lite/data';

export type Surface = 'floor' | 'wall' | 'ceiling';
export const SURFACES: readonly Surface[] = ['floor', 'wall', 'ceiling'];

const SURFACE_OF: Readonly<Record<string, Surface>> = {
  FLOORING: 'floor',
  CLADDING: 'wall',
  SKIRTINGBOARD: 'wall',
  MOLDING: 'wall',
  CEILING: 'ceiling',
};

/** The surface a covering of this PredefinedType finishes; null for the types that are not room finishes. */
export function surfaceOf(predefinedType: string): Surface | null {
  return SURFACE_OF[predefinedType.trim().toUpperCase()] ?? null;
}

export interface CoveringInput {
  /** The covering's identity across the loaded models (model and express id), to count it once however many times relations list it. */
  id: string;
  name: string;
  predefinedType: string;
  /** Square metres, the covering's whole area (`coveringArea`); null when the model gives none. */
  area: number | null;
}

export interface RoomInput {
  /** IfcSpace.Name when it is the number and LongName the name, else empty. */
  number: string;
  name: string;
  /** The storey it sits on; empty when none. */
  level: string;
  /** The storey's elevation, to order the rooms; null when unknown. */
  elevation: number | null;
  covers: CoveringInput[];
  boundary: CoveringInput[];
  contained: CoveringInput[];
  /** The room's own finish properties, by surface. */
  properties: Partial<Record<Surface, string>>;
}

export type FinishSource = 'coversSpaces' | 'spaceBoundary' | 'containment' | 'property';

export interface Finish {
  name: string;
  /** m², this room's share of the covering's area; null when the model gives none. */
  area: number | null;
  source: FinishSource;
  /** How many rooms the covering's area is split between equally: 1 when only this room uses it (and for a property finish). */
  sharedBy: number;
}

export interface RoomFinishes {
  number: string;
  name: string;
  level: string;
  finishes: Record<Surface, Finish[]>;
}

/** One printed line: a room's i-th finish of each surface. A room with no finishes has one empty line. */
export interface FinishLine {
  number: string;
  name: string;
  level: string;
  /** The room's first line, the one that carries its number and name. */
  first: boolean;
  floor: Finish | null;
  wall: Finish | null;
  ceiling: Finish | null;
}

const SOURCES: readonly { key: 'covers' | 'boundary' | 'contained'; source: FinishSource }[] = [
  { key: 'covers', source: 'coversSpaces' },
  { key: 'boundary', source: 'spaceBoundary' },
  { key: 'contained', source: 'containment' },
];

/** A room's finishes of one surface, each with the covering it came from (null for a property). */
function finishesOf(room: RoomInput, surface: Surface): { finish: Finish; covering: string | null }[] {
  for (const { key, source } of SOURCES) {
    const seen = new Set<string>();
    const found: { finish: Finish; covering: string | null }[] = [];
    for (const c of room[key]) {
      if (surfaceOf(c.predefinedType) !== surface || seen.has(c.id)) continue;
      seen.add(c.id);
      found.push({ finish: { name: c.name, area: c.area, source, sharedBy: 1 }, covering: c.id });
    }
    if (found.length) return found;
  }
  const named = room.properties[surface]?.trim();
  return named ? [{ finish: { name: named, area: null, source: 'property', sharedBy: 1 }, covering: null }] : [];
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** The rooms with their finishes: by storey elevation (unknown last), then number, then name. */
export function roomFinishes(rooms: readonly RoomInput[]): RoomFinishes[] {
  const found = [...rooms]
    .sort((a, b) => (a.elevation ?? Infinity) - (b.elevation ?? Infinity) || collator.compare(a.level, b.level) || collator.compare(a.number, b.number) || collator.compare(a.name, b.name))
    .map((r) => ({ room: r, bySurface: SURFACES.map((s) => finishesOf(r, s)) }));
  // The rooms each covering finishes: its area is split equally between them.
  const roomsOf = new Map<string, Set<number>>();
  found.forEach(({ bySurface }, i) => {
    for (const { covering } of bySurface.flat()) if (covering !== null) roomsOf.set(covering, (roomsOf.get(covering) ?? new Set()).add(i));
  });
  const share = ({ finish, covering }: { finish: Finish; covering: string | null }): Finish => {
    const sharedBy = covering === null ? 1 : roomsOf.get(covering)?.size ?? 1;
    return sharedBy > 1 ? { ...finish, sharedBy, area: finish.area === null ? null : finish.area / sharedBy } : finish;
  };
  return found.map(({ room: r, bySurface: [floor, wall, ceiling] }) => ({
    number: r.number,
    name: r.name,
    level: r.level,
    finishes: { floor: floor.map(share), wall: wall.map(share), ceiling: ceiling.map(share) },
  }));
}

/** Whether any finish's area is a share of a covering several rooms use. */
export function hasSharedFinish(rooms: readonly RoomFinishes[]): boolean {
  return rooms.some((r) => SURFACES.some((s) => r.finishes[s].some((f) => f.sharedBy > 1)));
}

/** The table's lines, in print order. */
export function finishLines(rooms: readonly RoomFinishes[]): FinishLine[] {
  return rooms.flatMap((r) => {
    const count = Math.max(1, ...SURFACES.map((s) => r.finishes[s].length));
    return Array.from({ length: count }, (_, i): FinishLine => ({
      number: r.number,
      name: r.name,
      level: r.level,
      first: i === 0,
      floor: r.finishes.floor[i] ?? null,
      wall: r.finishes.wall[i] ?? null,
      ceiling: r.finishes.ceiling[i] ?? null,
    }));
  });
}

const QTO = 'Qto_CoveringBaseQuantities';

/** NetArea, else GrossArea, among these sets' area quantities, scaled to m²; null when they have neither. */
function areaIn(sets: readonly QuantitySet[], areaScale: number): number | null {
  const areas = sets.flatMap((s) => s.quantities).filter((q) => q.type === QuantityType.Area && Number.isFinite(q.value));
  for (const name of ['NetArea', 'GrossArea']) {
    const q = areas.find((x) => x.name === name);
    if (q) return q.value * areaScale;
  }
  return null;
}

/**
 * A covering's area in m²: NetArea, else GrossArea, of Qto_CoveringBaseQuantities;
 * when that set gives neither, the same from any other quantity set (IFC2x3
 * exports write them to `BaseQuantities`); null when no set has either.
 */
export function coveringArea(qsets: readonly QuantitySet[], areaScale: number): number | null {
  return areaIn(qsets.filter((s) => s.name === QTO), areaScale) ?? areaIn(qsets.filter((s) => s.name !== QTO), areaScale);
}

/** The PredefinedType a covering is read by: its own, or its IfcCoveringType's when its own is NOTDEFINED or unset. */
export function coveringPredefinedType(own: string, ofType: string): string {
  const mine = own.trim();
  return (mine === '' || mine.toUpperCase() === 'NOTDEFINED') && ofType.trim() ? ofType : own;
}
