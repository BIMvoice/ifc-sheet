/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `star.en.ts`. Term choices: `../ro-glossary.md`. */
export const starRo = {
  'star.link': '★ Dați o stea pe GitHub',
  'star.linkAria': 'Dați o stea proiectului IfcSheet pe GitHub (se deschide într-o filă nouă)',
  'star.reminder': 'Dacă IfcSheet v-a economisit timp, o stea pe GitHub îi ajută pe alții să îl găsească.',
  'star.reminderLink': 'Dați o stea pe GitHub',
  'star.close': 'Închide',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
