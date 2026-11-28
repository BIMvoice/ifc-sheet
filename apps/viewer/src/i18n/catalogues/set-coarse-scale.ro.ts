/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for why a sheet of the set is coarser than 1:200 (`set-coarse-scale.en.ts`). Term choices: `../ro-glossary.md`. */
export const setCoarseScaleRo = {
  'wall.reason.coarse': '1 : {scale}, cea mai mare scară care încape pe {paper}; la 1 : {set} desenele depășesc planșa',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
