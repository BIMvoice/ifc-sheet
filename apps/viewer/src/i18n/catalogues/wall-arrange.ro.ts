/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `wall-arrange.en.ts`. Term choices: `../ro-glossary.md`. */
export const wallArrangeRo = {
  'wall.fitOffer.title': 'Nu încape pe coală',
  'wall.fitOffer.body': '{name} ocupă {pages} coli la 1:{scale}. Împărțiți-l în părți care încap sau lăsați-l să continue pe colile următoare.',
  'wall.fitOffer.keep': 'Lăsați pe mai multe coli',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
