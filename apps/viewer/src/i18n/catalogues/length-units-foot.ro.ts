/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `length-units-foot.en.ts`. */
export const lengthUnitsFootRo = {
  'wall.units.lengthUnit.ft': 'Picioare (ft)',
  'wall.units.lengthUnit.ftUS': 'Picioare topografice SUA (ftUS)',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
