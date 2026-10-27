/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The urban indicators of a building permit (Romanian practice: STAS 4908-85
 * for the areas, Law 350/2001 for POT and CUT), from storey footprints, room
 * areas and the site area. Pure: the footprints come from `footprint.ts`, the
 * rooms and storeys from `urban-models.ts`.
 *
 * - Elevations are read against ±0.00: the user's, else 0 when the storeys
 *   reach it, else the building's ElevationOfRefHeight when it lies among
 *   them, else the lowest storey (and the sheet says it was assumed), so a
 *   model with absolute elevations is read the same way.
 * - Built area of a storey: the area inside the storey's outline, measured to
 *   the outer face of its external walls, courtyards and light wells left out.
 * - Below ground (a basement, `subsol`): more than half the storey's height
 *   (to the next storey's floor) under the terrain level, which the user
 *   gives against ±0.00 (default ±0.00). A half-buried storey (`demisol`) is
 *   above ground.
 * - Ac (arie construită): the built area of the storey containing ±0.00, the
 *   horizontal section at ±0.00.
 * - Ad (arie desfășurată): the sum of the built areas of ALL storeys,
 *   basements included (STAS 4908-85).
 * - Ad for CUT: Ad less the storeys left out, a choice per storey. By default
 *   the basements whose clear height is at most 1.80 m (Law 350/2001's note
 *   also leaves out basements used only for parking, technical rooms or civil
 *   protection; that use is not in the model, so it is the user's choice).
 *   The clear height is taken as the floor-to-floor height, an upper bound:
 *   the slab above is not subtracted.
 * - Au (arie utilă): the sum of the rooms' net floor areas, by category
 *   (`urban-models.ts` decides which spaces are rooms).
 * - POT = Ac / site area × 100 (%), CUT = Ad for CUT / site area. Without a
 *   site area both are null, never a made-up number.
 */

export type Pt = readonly [number, number];

/** One piece of a footprint: its outer ring and the courtyards cut out of it (metres, plan). */
export interface FootprintShape {
  outer: readonly Pt[];
  holes: readonly (readonly Pt[])[];
}

export interface StoreyInput {
  name: string;
  /** Floor elevation, metres, ±0.00 being the building's reference. */
  elevation: number;
  /** Null when nothing on the storey has a plan outline. */
  footprint: readonly FootprintShape[] | null;
  /** Footprint elements (walls, columns, curtain walls, slabs) on the storey that gave no outline: its area is then a lower bound. */
  unmeasured?: number;
}

export interface SpaceInput {
  /** Index into `UrbanInput.storeys`, or null for a room on no storey. */
  storey: number | null;
  category: string;
  /** Square metres; null when the model states none. */
  area: number | null;
}

/** The user's choices the indicators are read with, kept in the project. */
export interface UrbanSettings {
  /** The terrain level against ±0.00, metres; absent: ±0.00. */
  terrainLevel?: number;
  /** The model elevation of ±0.00, metres; absent: found from the storeys (see the module comment). */
  zeroElevation?: number;
  /** By storey name: true leaves it out of Ad for CUT, false counts it; absent: the default (a basement of clear height ≤ 1.80 m is left out). */
  cutExcluded?: Readonly<Record<string, boolean>>;
}

export interface UrbanInput {
  storeys: readonly StoreyInput[];
  spaces: readonly SpaceInput[];
  /** Square metres; null (or not positive) when unknown. */
  siteArea: number | null;
  /** The building's ElevationOfRefHeight, metres, when the model states it. */
  buildingRefElevation?: number | null;
  settings?: UrbanSettings;
}

/** Law 350/2001: a basement with a clear height up to this is not counted in Ad for CUT. */
export const CUT_BASEMENT_MAX_CLEAR_HEIGHT = 1.8;

/** How ±0.00 was found: typed by the user, 0 among the storeys, the building's reference elevation, or assumed at the lowest storey. */
export type ZeroSource = 'user' | 'model' | 'building' | 'assumed';

export interface UrbanStoreyRow {
  name: string;
  /** Floor elevation against ±0.00, metres. */
  elevation: number;
  /** Floor to the next storey's floor, metres; null for the top storey. */
  height: number | null;
  /** m², null when the storey has no footprint. */
  builtArea: number | null;
  /** m² of the rooms on it, null when none states an area. */
  usefulArea: number | null;
  belowGround: boolean;
  /** The storey containing ±0.00, Ac's. */
  ground: boolean;
  /** Counted in Ad for CUT. */
  inCut: boolean;
  /** What the law's default would decide for `inCut`; the user may have chosen otherwise. */
  inCutByDefault: boolean;
  /** Footprint elements left unmeasured: `builtArea` is at least, not exactly, the figure. */
  unmeasured: number;
}

export interface UrbanIndicators {
  /** Highest storey first, as on a section. */
  storeys: UrbanStoreyRow[];
  ac: number | null;
  /** All storeys, basements included. */
  ad: number | null;
  /** Ad less the storeys left out for CUT. */
  adCut: number | null;
  /** Ac / Ad / Ad for CUT (and so POT / CUT) are lower bounds: a storey they sum left elements unmeasured. */
  acAtLeast: boolean;
  adAtLeast: boolean;
  adCutAtLeast: boolean;
  au: number | null;
  /** m² of the rooms on no storey: in `au`, in no storey's `usefulArea`. Null when there are none. */
  auNoStorey: number | null;
  auByCategory: { category: string; area: number }[];
  siteArea: number | null;
  /** Percent. */
  pot: number | null;
  cut: number | null;
  /** The terrain level against ±0.00, metres. */
  terrainLevel: number;
  /** The model elevation taken as ±0.00, and how it was found. */
  zero: { elevation: number; source: ZeroSource };
}

/** The signed area of a ring (shoelace), counter-clockwise positive. */
export function signedRingArea(ring: readonly Pt[]): number {
  let s = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % n];
    s += x0 * y1 - x1 * y0;
  }
  return s / 2;
}

/** The area a ring encloses, whatever its orientation. */
export function ringArea(ring: readonly Pt[]): number {
  return Math.abs(signedRingArea(ring));
}

/** The area a footprint covers: each outer ring less its holes. */
export function footprintArea(shapes: readonly FootprintShape[]): number {
  let total = 0;
  for (const shape of shapes) {
    total += ringArea(shape.outer);
    for (const hole of shape.holes) total -= ringArea(hole);
  }
  return total;
}

/**
 * Which storeys lie below ground: more than half the storey's height (to the
 * next storey's floor) under `terrain`. The top storey has no height to halve;
 * it is below ground only when its floor is. Elevations and terrain in one frame.
 */
export function belowGroundFlags(elevations: readonly number[], terrain = 0): boolean[] {
  const order = elevations.map((e, i) => ({ e, i })).sort((a, b) => a.e - b.e);
  const out = new Array<boolean>(elevations.length).fill(false);
  order.forEach(({ e, i }, k) => {
    const next = order[k + 1]?.e;
    out[i] = next === undefined ? e < terrain : e + (next - e) / 2 < terrain;
  });
  return out;
}

/** A millimetre: a storey whose floor is this close to ±0.00 is on it. */
const ON_ZERO = 0.001;

/** The model elevation of ±0.00 (see the module comment). */
export function zeroElevation(elevations: readonly number[], buildingRef: number | null | undefined, user: number | undefined): { elevation: number; source: ZeroSource } {
  if (user !== undefined && Number.isFinite(user)) return { elevation: user, source: 'user' };
  if (elevations.length === 0) return { elevation: 0, source: 'model' };
  const min = Math.min(...elevations), max = Math.max(...elevations);
  if (min <= ON_ZERO) return { elevation: 0, source: 'model' };
  if (buildingRef !== null && buildingRef !== undefined && Number.isFinite(buildingRef) && buildingRef >= min - ON_ZERO && buildingRef <= max + ON_ZERO) {
    return { elevation: buildingRef, source: 'building' };
  }
  return { elevation: min, source: 'assumed' };
}

const positive = (v: number | null): number | null => (v !== null && Number.isFinite(v) && v > 0 ? v : null);

export function urbanIndicators(input: UrbanInput): UrbanIndicators {
  const settings = input.settings ?? {};
  const zero = zeroElevation(input.storeys.map((s) => s.elevation), input.buildingRefElevation, settings.zeroElevation);
  const terrainLevel = settings.terrainLevel !== undefined && Number.isFinite(settings.terrainLevel) ? settings.terrainLevel : 0;
  const relative = input.storeys.map((s) => s.elevation - zero.elevation);
  const below = belowGroundFlags(relative, terrainLevel);
  const ascending = relative.map((e, i) => ({ e, i })).sort((a, b) => a.e - b.e);
  const height = new Array<number | null>(relative.length).fill(null);
  ascending.forEach(({ e, i }, k) => { if (k + 1 < ascending.length) height[i] = ascending[k + 1].e - e; });
  // The storey containing ±0.00: the highest whose floor is at or under it; the lowest when every floor is above.
  const onOrUnder = ascending.filter(({ e }) => e <= ON_ZERO);
  const groundIndex = ascending.length === 0 ? -1 : (onOrUnder.at(-1) ?? ascending[0]).i;

  const useful = new Map<number, number>();
  const byCategory = new Map<string, number>();
  let au: number | null = null;
  let auNoStorey: number | null = null;
  for (const space of input.spaces) {
    if (space.area === null || !Number.isFinite(space.area)) continue;
    au = (au ?? 0) + space.area;
    byCategory.set(space.category, (byCategory.get(space.category) ?? 0) + space.area);
    if (space.storey !== null) useful.set(space.storey, (useful.get(space.storey) ?? 0) + space.area);
    else auNoStorey = (auNoStorey ?? 0) + space.area;
  }
  const rows: UrbanStoreyRow[] = input.storeys.map((s, i) => {
    const h = height[i];
    const inCutByDefault = !(below[i] && h !== null && h <= CUT_BASEMENT_MAX_CLEAR_HEIGHT + 1e-9);
    const chosen = settings.cutExcluded?.[s.name];
    return {
      name: s.name,
      elevation: relative[i],
      height: h,
      builtArea: s.footprint ? footprintArea(s.footprint) : null,
      usefulArea: useful.get(i) ?? null,
      belowGround: below[i],
      ground: i === groundIndex,
      inCut: chosen === undefined ? inCutByDefault : !chosen,
      inCutByDefault,
      unmeasured: s.unmeasured ?? 0,
    };
  });
  const sum = (list: UrbanStoreyRow[]) => {
    const measured = list.filter((r) => r.builtArea !== null);
    return measured.length ? measured.reduce((total, r) => total + (r.builtArea ?? 0), 0) : null;
  };
  const ac = groundIndex >= 0 ? rows[groundIndex].builtArea : null;
  const ad = sum(rows);
  const adCut = sum(rows.filter((r) => r.inCut));
  const siteArea = positive(input.siteArea);
  return {
    storeys: rows.sort((a, b) => b.elevation - a.elevation),
    ac,
    ad,
    adCut,
    acAtLeast: groundIndex >= 0 && (input.storeys[groundIndex].unmeasured ?? 0) > 0,
    adAtLeast: rows.some((r) => r.unmeasured > 0),
    adCutAtLeast: rows.some((r) => r.inCut && r.unmeasured > 0),
    au,
    auNoStorey,
    auByCategory: [...byCategory].map(([category, area]) => ({ category, area })).sort((a, b) => a.category.localeCompare(b.category)),
    siteArea,
    pot: siteArea !== null && ac !== null ? (ac / siteArea) * 100 : null,
    cut: siteArea !== null && adCut !== null ? adCut / siteArea : null,
    terrainLevel,
    zero,
  };
}
