/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

export const lengthUnitsFootEn = {
  'wall.units.lengthUnit.ft': 'Feet (ft)',
  'wall.units.lengthUnit.ftUS': 'US survey feet (ftUS)',
} as const satisfies Record<string, TranslationValue>;
