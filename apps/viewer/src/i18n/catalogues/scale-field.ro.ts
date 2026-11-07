/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the typed-scale field's buttons (`scale-field.en.ts`). Term choices: `../ro-glossary.md`. */
export const scaleFieldRo = {
  'scaleField.apply': 'Aplică',
  'scaleField.cancel': 'Anulează',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
