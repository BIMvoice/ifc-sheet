/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `wall-edit-fields.en.ts` (#168). Term choices: `../ro-glossary.md`. */
export const wallEditFieldsRo = {
  'wall.edit.distance': 'Distanța',
  'wall.edit.radius': 'Raza',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
