/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The area summary of a Romanian permit set (#42): Su, Sc and Sd per level and for the building. Not a second formula: these
 * are the urban indicators' own figures (`urbanIndicators`, `indicators.ts`) read under the names the issue and the permit
 * forms use, so the room schedule and the urban sheet cannot disagree.
 *
 * - Su, suprafața utilă: the sum of the rooms' areas (room-areas.ts's rule), per level the level's `usefulArea`; the building's
 *   is Au. Rooms on no level are a line of their own, so the lines add up to the building.
 * - Sc, suprafața construită: the building's is Ac, the built area of the storey containing ±0.00 (the footprint at the
 *   ground), so only that level's line carries it.
 * - Sd, suprafața desfășurată: the building's is Ad, the sum of the built areas of ALL storeys, basements included (STAS
 *   4908-85); a level's line carries that level's built area, the term of the sum. Ad for CUT, which leaves some basements
 *   out, is a different figure and is not printed here.
 *
 * A built area measured over elements that gave no outline is a lower bound (`unmeasured`): its figure is flagged.
 */

import type { UrbanIndicators } from './urban-indicators.js';

export interface AreaSummaryLevel {
  /** The level's name; empty for the rooms on no level. */
  name: string;
  su: number | null;
  /** Ac, on the level containing ±0.00 only. */
  sc: number | null;
  /** The level's built area, a term of Ad. */
  sd: number | null;
  /** `sc` / `sd` are lower bounds (elements of the level gave no outline). */
  atLeast: boolean;
}

export interface AreaSummary {
  /** Low to high, as the room table lists them; then the rooms on no level. */
  levels: AreaSummaryLevel[];
  building: { su: number | null; sc: number | null; sd: number | null; scAtLeast: boolean; sdAtLeast: boolean };
}

export function areaSummary(result: UrbanIndicators): AreaSummary {
  const levels: AreaSummaryLevel[] = [...result.storeys].reverse()
    .filter((s) => s.usefulArea !== null || s.builtArea !== null)
    .map((s) => ({ name: s.name, su: s.usefulArea, sc: s.ground ? s.builtArea : null, sd: s.builtArea, atLeast: s.unmeasured > 0 }));
  if (result.auNoStorey !== null) levels.push({ name: '', su: result.auNoStorey, sc: null, sd: null, atLeast: false });
  return { levels, building: { su: result.au, sc: result.ac, sd: result.ad, scAtLeast: result.acAtLeast, sdAtLeast: result.adAtLeast } };
}
