/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** A plan's overhead range (#490): what lies above the cut (beams, the slab edge above) drawn dashed, and how high. */
export const planOverheadEn = {
  'planOverhead.show': 'Draw what is overhead',
  'planOverhead.height': 'Overhead height',
  'planOverhead.toFloorAbove': 'To the floor above',
} as const satisfies Record<string, TranslationValue>;
