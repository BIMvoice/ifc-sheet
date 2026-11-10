/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `plan-orientation.en.ts`: the plan drawn square to the building or to true north. Term choices: `../ro-glossary.md`. */
export const planOrientationRo = {
  'planOrientation.label': 'Planul desenat',
  'planOrientation.building': 'Pe axele clădirii',
  'planOrientation.trueNorth': 'Nord geografic',
  'planOrientation.noModel': 'Deschideți mai întâi modelul: planul se rotește odată cu el.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
