/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `tag-custom.en.ts`. Term choices: `../ro-glossary.md`. */
export const tagCustomRo = {
  'tagCustom.option': 'Personalizat (stabilit la Câmpurile etichetei)',
  'tagCustom.card': 'textul personalizat ales la Câmpurile etichetei (Description, dacă nu e stabilit altfel)',
  'tagFields.field.custom': 'Text personalizat',
  'atype.tag.custom': 'Personalizat (Câmpurile etichetei)',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
