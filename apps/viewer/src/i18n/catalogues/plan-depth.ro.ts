/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `plan-depth.en.ts`. Term choices: `../ro-glossary.md`. */
export const planDepthRo = {
  'planDepth.label': 'Adâncimea vederii',
  'planDepth.toThisFloor': 'Până la acest nivel ({depth} m)',
  'planDepth.hint': 'De la secțiune. Gol: până la acest nivel; măriți-l pentru a vedea nivelul de dedesubt. 0 = doar secțiunea.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
