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
 * The surface comes from the covering's PredefinedType: FLOORING is floor;
 * CLADDING, SKIRTINGBOARD and MOLDING are wall; CEILING is ceiling. Any other
 * value (ROOFING, INSULATION, MEMBRANE, SLEEVING, WRAPPING, COPING, USERDEFINED,
 * NOTDEFINED) is not a room finish and is left out.
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
  /** Express id, to count a covering once however many times a relation lists it. */
  id: number;
  name: string;
  predefinedType: string;
  /** Square metres: Qto_CoveringBaseQuantities NetArea, else GrossArea; null when the model gives neither. */
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
  /** m²; null when the model gives none. */
  area: number | null;
  source: FinishSource;
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

function finishesOf(room: RoomInput, surface: Surface): Finish[] {
  for (const { key, source } of SOURCES) {
    const seen = new Set<number>();
    const found: Finish[] = [];
    for (const c of room[key]) {
      if (surfaceOf(c.predefinedType) !== surface || seen.has(c.id)) continue;
      seen.add(c.id);
      found.push({ name: c.name, area: c.area, source });
    }
    if (found.length) return found;
  }
  const named = room.properties[surface]?.trim();
  return named ? [{ name: named, area: null, source: 'property' }] : [];
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** The rooms with their finishes: by storey elevation (unknown last), then number, then name. */
export function roomFinishes(rooms: readonly RoomInput[]): RoomFinishes[] {
  return [...rooms]
    .sort((a, b) => (a.elevation ?? Infinity) - (b.elevation ?? Infinity) || collator.compare(a.level, b.level) || collator.compare(a.number, b.number) || collator.compare(a.name, b.name))
    .map((r) => ({
      number: r.number,
      name: r.name,
      level: r.level,
      finishes: { floor: finishesOf(r, 'floor'), wall: finishesOf(r, 'wall'), ceiling: finishesOf(r, 'ceiling') },
    }));
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

/** A covering's area in m² from Qto_CoveringBaseQuantities: NetArea, else GrossArea; null when it has neither. */
export function coveringArea(qsets: readonly QuantitySet[], areaScale: number): number | null {
  const areas = qsets.filter((s) => s.name === 'Qto_CoveringBaseQuantities').flatMap((s) => s.quantities).filter((q) => q.type === QuantityType.Area && Number.isFinite(q.value));
  for (const name of ['NetArea', 'GrossArea']) {
    const q = areas.find((x) => x.name === name);
    if (q) return q.value * areaScale;
  }
  return null;
}
