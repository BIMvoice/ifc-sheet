/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Quantities by element type: for each type (IfcWallType, IfcSlabType, ...)
 * how many elements there are and how much length, area and volume, per
 * storey and in total, read from the model's own quantity sets (Qto_*), never
 * measured off the geometry. Elements without a type are grouped by their IFC
 * class instead. An element whose Qto gives nothing is counted, left out of
 * the sums and noted in `noQto`, so a geometry-measured fill can take it over
 * later.
 *
 * Pure: elements in, rows out. `collectTypeElements` reads the loaded models
 * into that input.
 */

import { QuantityType, type QuantitySet } from '@ifc-lite/data';

export interface TypeElement {
  /** IFC class, `IfcWall`. */
  className: string;
  /** The defining type's class, `IfcWallType`; null when the element has no type. */
  typeClass: string | null;
  /** The defining type's name; null when the element has no type (or the type no name). */
  typeName: string | null;
  /** Storey name; '' when the element is on none. */
  level: string;
  /** Storey elevation, used to order levels; null when unknown. */
  elevation: number | null;
  /** Metres, square metres, cubic metres; null when the model gives none. */
  length: number | null;
  area: number | null;
  volume: number | null;
}

export interface Totals {
  count: number;
  /** Elements with no length, area or volume at all. */
  noQto: number;
  /** Sums over the elements that state one; null when none does. */
  length: number | null;
  area: number | null;
  volume: number | null;
}

export interface TypeRow {
  key: string;
  /** The type's name; null for the elements without a type. */
  typeName: string | null;
  /** The type's class when typed, else the elements' class. */
  className: string;
  total: Totals;
  /** By level name. */
  byLevel: Record<string, Totals>;
}

export interface TypeQuantities {
  /** Level names, lowest first; '' (no storey) last. */
  levels: string[];
  rows: TypeRow[];
}

/**
 * The quantity each IFC class is measured by, in order of preference: the net
 * figure when the model gives one, else the gross. Names are those of the
 * standard Qto_*BaseQuantities sets; a quantity not on the list is never
 * guessed at (a "Width" is not a length).
 *  - Length: `Length` for walls, slabs, beams, columns, members, railings, ...
 *  - Area: the face area of what is built. A wall by its side face
 *    (NetSideArea, GrossSideArea), a slab, roof or covering by its plan area
 *    (NetArea, GrossArea), a beam, column or member by its surface
 *    (NetSurfaceArea, GrossSurfaceArea, OuterSurfaceArea), a door or window by
 *    its Area, a space by its floor area (NetFloorArea, GrossFloorArea).
 *  - Volume: NetVolume, else GrossVolume.
 */
const LENGTH = ['Length'];
const VOLUME = ['NetVolume', 'GrossVolume'];
const SIDE = ['NetSideArea', 'GrossSideArea'];
const PLAN = ['NetArea', 'GrossArea'];
const SURFACE = ['NetSurfaceArea', 'GrossSurfaceArea', 'OuterSurfaceArea'];
const FRAME = ['Area'];
const AREA_BY_CLASS: Record<string, readonly string[]> = {
  IFCWALL: SIDE, IFCWALLSTANDARDCASE: SIDE, IFCCURTAINWALL: [...SIDE, ...PLAN],
  IFCSLAB: PLAN, IFCROOF: PLAN, IFCCOVERING: PLAN, IFCPLATE: PLAN, IFCFOOTING: PLAN, IFCRAMPFLIGHT: PLAN, IFCSTAIRFLIGHT: PLAN,
  IFCBEAM: SURFACE, IFCCOLUMN: SURFACE, IFCMEMBER: SURFACE, IFCPILE: SURFACE,
  IFCDOOR: FRAME, IFCWINDOW: FRAME,
  IFCSPACE: ['NetFloorArea', 'GrossFloorArea'],
};
/** A class not on the list: the plan area, else a side or surface one, else `Area`. */
const AREA_DEFAULT = [...PLAN, ...SIDE, ...SURFACE, ...FRAME];

/** The named quantity of `type` from any set, first match in `order`; null when there is none. */
function named(qsets: readonly QuantitySet[], type: QuantityType, order: readonly string[]): number | null {
  for (const name of order) {
    for (const set of qsets) {
      const q = set.quantities.find((x) => x.name === name && x.type === type && Number.isFinite(x.value));
      if (q) return q.value;
    }
  }
  return null;
}

/** An element's length, area and volume from its quantity sets, in the model's units scaled to SI. */
export function elementTypeQuantities(
  className: string,
  qsets: readonly QuantitySet[],
  scales: { length: number; area: number; volume: number },
): { length: number | null; area: number | null; volume: number | null } {
  const scaled = (v: number | null, s: number) => (v === null ? null : v * s);
  return {
    length: scaled(named(qsets, QuantityType.Length, LENGTH), scales.length),
    area: scaled(named(qsets, QuantityType.Area, AREA_BY_CLASS[className.toUpperCase()] ?? AREA_DEFAULT), scales.area),
    volume: scaled(named(qsets, QuantityType.Volume, VOLUME), scales.volume),
  };
}

const empty = (): Totals => ({ count: 0, noQto: 0, length: null, area: null, volume: null });

function add(t: Totals, e: TypeElement): void {
  t.count += 1;
  if (e.length === null && e.area === null && e.volume === null) t.noQto += 1;
  if (e.length !== null) t.length = (t.length ?? 0) + e.length;
  if (e.area !== null) t.area = (t.area ?? 0) + e.area;
  if (e.volume !== null) t.volume = (t.volume ?? 0) + e.volume;
}

/** Sum of several totals: a sum over the ones that state a figure, null when none does. */
export function sumTotals(list: readonly Totals[]): Totals {
  const out = empty();
  for (const t of list) {
    out.count += t.count;
    out.noQto += t.noQto;
    for (const k of ['length', 'area', 'volume'] as const) if (t[k] !== null) out[k] = (out[k] ?? 0) + t[k]!;
  }
  return out;
}

/** One row per type (merged across models by class and name), typed rows first by class then name, untyped ones after by class; one pass over the elements. */
export function typeQuantities(elements: readonly TypeElement[]): TypeQuantities {
  const rows = new Map<string, TypeRow>();
  const elevation = new Map<string, number | null>();
  for (const e of elements) {
    const typed = e.typeClass !== null && e.typeName !== null;
    const key = typed ? `T|${e.typeClass}|${e.typeName}` : `C|${e.className}`;
    let row = rows.get(key);
    if (!row) {
      row = { key, typeName: typed ? e.typeName : null, className: typed ? e.typeClass! : e.className, total: empty(), byLevel: {} };
      rows.set(key, row);
    }
    add(row.total, e);
    add((row.byLevel[e.level] ??= empty()), e);
    const known = elevation.get(e.level);
    if (known === undefined || (e.elevation !== null && (known === null || e.elevation < known))) elevation.set(e.level, e.elevation);
  }
  const levels = [...elevation.keys()].sort((a, b) => {
    if (a === '' || b === '') return a === b ? 0 : a === '' ? 1 : -1;
    const ea = elevation.get(a) ?? Infinity, eb = elevation.get(b) ?? Infinity;
    return ea - eb || a.localeCompare(b);
  });
  const sorted = [...rows.values()].sort((a, b) =>
    Number(a.typeName === null) - Number(b.typeName === null) || a.className.localeCompare(b.className) || (a.typeName ?? '').localeCompare(b.typeName ?? ''));
  return { levels, rows: sorted };
}
