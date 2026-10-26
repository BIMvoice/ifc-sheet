/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/**
 * Quantities measured from geometry (#74): the note under the material takeoff
 * and the quantities by type that says what a `*` figure is, how many figures
 * could not be measured, and the CSV and XLSX column naming the measured ones.
 */
export const measuredQuantitiesEn = {
  'measuredQty.note': '* Measured from the geometry: the model states no quantity. Volume: the closed solid as drawn, openings cut. Wall area: one side face, openings removed (the two sides averaged). Slab area: the top face, openings removed.',
  'measuredQty.unmeasured': '{count} element(s) state no volume and their geometry is not a closed solid, so no volume was measured for them.',
  'measuredQty.column': 'Measured from geometry',
  'measuredQty.volume': 'volume',
  'measuredQty.area': 'area',
} as const satisfies Record<string, TranslationValue>;
