/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the line on a drawing that says how to select several elements at once (#666). */
export const regionSelectRo = {
  'regionSelect.hint': 'Trage pe spațiu liber ca să selectezi: spre dreapta ce se află în cadru, spre stânga ce atinge cadrul. Alt + tragere desenează o buclă. Shift adaugă. Butonul din mijloc deplasează desenul.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
