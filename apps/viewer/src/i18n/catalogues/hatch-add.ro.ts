/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the "Add a hatch pattern" button (`hatch-add.en.ts`). Term choices: `../ro-glossary.md`. */
export const hatchAddRo = {
  'hatchadd.button': 'Adaugă un tipar de hașură',
  'hatchadd.title': 'Încarcă un fișier .pat. Tiparele lui se adaugă în această listă, primul este ales imediat, iar ele se salvează cu proiectul.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
