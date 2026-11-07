/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The Distance and Radius fields on the tool card of Offset, Fillet and Chamfer (#168). */
export const wallEditFieldsEn = {
  'wall.edit.distance': 'Distance',
  'wall.edit.radius': 'Radius',
} as const satisfies Record<string, TranslationValue>;
