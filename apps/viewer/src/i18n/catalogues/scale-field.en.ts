/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The buttons of the typed-scale field on a drawing's card (#168). Romanian: `scale-field.ro.ts`. */
export const scaleFieldEn = {
  'scaleField.apply': 'Apply',
  'scaleField.cancel': 'Cancel',
} as const satisfies Record<string, TranslationValue>;
