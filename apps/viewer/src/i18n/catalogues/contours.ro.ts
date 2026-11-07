/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `contours.en.ts` (#182): "curbe de nivel" as in `../ro-glossary.md`. */
export const contoursRo = {
  'contours.interval': 'Echidistanța curbelor de nivel (m)',
  'contours.intervalHint': 'Fiecare a cincea curbă de nivel se trasează mai gros; 0 pentru niciuna',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
