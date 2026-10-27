/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Whether the loaded model is inside what the simplified permit project covers: Legea 169/2026 Anexa 3, "locuință unifamilială
 * în mediul rural (regim de înălțime de maxim P + M și o suprafață construită desfășurată de maximum 150 mp)". A warning, never a
 * block: the set is made either way (the template steps its sheets up to a larger paper for a larger building). The two figures
 * are read here from the urban indicators; the findings and their limits are `ruralReadiness` (`readiness.ts`), so the app's
 * "What the model lacks" list, the PAC drawer and `ifcsheet check` say the same thing.
 *
 * - Levels. A storey counts when its floor is at or above ±0.00 (`elevation >= 0`, the urban indicators' own reference, to a
 *   millimetre). P + M is two: the ground floor and the attic (mansardă, modelled as a storey). A basement or any storey below
 *   ±0.00 is not counted as a level: the text names no basement, so it neither passes nor fails the height rule. Its built area
 *   still counts in Sd, as it does in the area summary.
 * - Area. Sd, suprafața construită desfășurată: `areaSummary(...).building.sd`, the room schedule's own figure (the sum of the
 *   built areas of all storeys), not a second computation. A lower bound (a storey gave no outline) over the limit is over it.
 *
 * Own entry point of the measuring (`rural-scope-read.ts`): it loads the parser and the wasm 2D booleans.
 */

import type { RuralScope } from './readiness.js';
import { areaSummary } from './urban-area-summary.js';
import type { UrbanIndicators } from './urban-indicators.js';

/** A storey's floor within this of ±0.00 (metres) is on it. */
const ON_ZERO = 0.001;

/** The levels above ±0.00 and Sd of the model whose indicators are `result`. */
export function ruralScopeOf(result: UrbanIndicators): RuralScope {
  const { sd, sdAtLeast } = areaSummary(result).building;
  return { levels: result.storeys.filter((s) => s.elevation >= -ON_ZERO).length, sd, sdAtLeast };
}
