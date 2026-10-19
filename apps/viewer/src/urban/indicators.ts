/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The urban indicators of a building permit (Romanian practice, Law 350/2001
 * and the urbanism regulations), from storey footprints, room areas and the
 * site area. Pure: the footprints come from `footprint.ts`, the rooms and
 * storeys from `urban-models.ts`.
 *
 * - Built area of a storey: the area inside the storey's outline, measured to
 *   the outer face of its external walls, courtyards and light wells left out.
 * - Ac (arie construită): the built area of the ground storey, the lowest one
 *   above ground.
 * - Ad (arie desfășurată): the sum of the built areas of the storeys above
 *   ground. A storey is below ground (a basement, `subsol`) when more than
 *   half its height lies under ±0.00; a half-buried storey (`demisol`) counts.
 *   `includeBelowGround` adds the basements.
 * - Au (arie utilă): the sum of the rooms' net floor areas, by category.
 * - POT = Ac / site area × 100 (%), CUT = Ad / site area. Without a site area
 *   both are null, never a made-up number.
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

export interface UrbanInput {
  storeys: readonly StoreyInput[];
  spaces: readonly SpaceInput[];
  /** Square metres; null (or not positive) when unknown. */
  siteArea: number | null;
  includeBelowGround?: boolean;
}

export interface UrbanStoreyRow {
  name: string;
  elevation: number;
  /** m², null when the storey has no footprint. */
  builtArea: number | null;
  /** m² of the rooms on it, null when none states an area. */
  usefulArea: number | null;
  belowGround: boolean;
  /** The storey Ac is measured on. */
  ground: boolean;
  /** Counted in Ad. */
  inAd: boolean;
  /** Footprint elements left unmeasured: `builtArea` is at least, not exactly, the figure. */
  unmeasured: number;
}

export interface UrbanIndicators {
  /** Highest storey first, as on a section. */
  storeys: UrbanStoreyRow[];
  ac: number | null;
  ad: number | null;
  /** Ac / Ad (and so POT / CUT) are lower bounds: a storey they sum left elements unmeasured. */
  acAtLeast: boolean;
  adAtLeast: boolean;
  au: number | null;
  auByCategory: { category: string; area: number }[];
  siteArea: number | null;
  /** Percent. */
  pot: number | null;
  cut: number | null;
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
 * next storey's floor) under ±0.00. The top storey has no height to halve; it
 * is below ground only when its floor is.
 */
export function belowGroundFlags(elevations: readonly number[]): boolean[] {
  const order = elevations.map((e, i) => ({ e, i })).sort((a, b) => a.e - b.e);
  const out = new Array<boolean>(elevations.length).fill(false);
  order.forEach(({ e, i }, k) => {
    const next = order[k + 1]?.e;
    out[i] = next === undefined ? e < 0 : e + (next - e) / 2 < 0;
  });
  return out;
}

const positive = (v: number | null): number | null => (v !== null && Number.isFinite(v) && v > 0 ? v : null);

export function urbanIndicators(input: UrbanInput): UrbanIndicators {
  const below = belowGroundFlags(input.storeys.map((s) => s.elevation));
  const useful = new Map<number, number>();
  const byCategory = new Map<string, number>();
  let au: number | null = null;
  for (const space of input.spaces) {
    if (space.area === null || !Number.isFinite(space.area)) continue;
    au = (au ?? 0) + space.area;
    byCategory.set(space.category, (byCategory.get(space.category) ?? 0) + space.area);
    if (space.storey !== null) useful.set(space.storey, (useful.get(space.storey) ?? 0) + space.area);
  }
  let groundIndex = -1;
  input.storeys.forEach((s, i) => {
    if (!below[i] && (groundIndex < 0 || s.elevation < input.storeys[groundIndex].elevation)) groundIndex = i;
  });
  const rows: UrbanStoreyRow[] = input.storeys.map((s, i) => ({
    name: s.name,
    elevation: s.elevation,
    builtArea: s.footprint ? footprintArea(s.footprint) : null,
    usefulArea: useful.get(i) ?? null,
    belowGround: below[i],
    ground: i === groundIndex,
    inAd: !below[i] || !!input.includeBelowGround,
    unmeasured: s.unmeasured ?? 0,
  }));
  const ac = groundIndex >= 0 ? rows[groundIndex].builtArea : null;
  const counted = rows.filter((r) => r.inAd && r.builtArea !== null);
  const ad = counted.length ? counted.reduce((sum, r) => sum + (r.builtArea ?? 0), 0) : null;
  const siteArea = positive(input.siteArea);
  const acAtLeast = groundIndex >= 0 && rows[groundIndex].unmeasured > 0;
  const adAtLeast = rows.some((r) => r.inAd && r.unmeasured > 0);
  return {
    storeys: rows.sort((a, b) => b.elevation - a.elevation),
    ac,
    ad,
    acAtLeast,
    adAtLeast,
    au,
    auByCategory: [...byCategory].map(([category, area]) => ({ category, area })).sort((a, b) => a.category.localeCompare(b.category)),
    siteArea,
    pot: siteArea !== null && ac !== null ? (ac / siteArea) * 100 : null,
    cut: siteArea !== null && ad !== null ? ad / siteArea : null,
  };
}
