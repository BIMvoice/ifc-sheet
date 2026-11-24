/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `annotate-run.en.ts` (#869). Term choices: `../ro-glossary.md`. */
export const annotateRunRo = {
  'wall.annotateRun.failed': 'Adnotarea setului s-a oprit din cauza unei erori: {message}',
  'wall.annotateRun.nothingOn': 'Nicio adnotare nu este activată. Activați etichetele, cotele sau marcajele de nivel la Adnotați setul, în bara de sus.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
