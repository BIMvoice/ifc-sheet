/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `selection-turn.en.ts` (#168). */
export const selectionTurnRo = {
  'drafting.cmd.flip': 'FLIP',
  'drafting.sel.flipH': 'Întoarce stânga-dreapta',
  'drafting.sel.flipV': 'Întoarce sus-jos',
  'drafting.sel.flipKeep': 'Păstrează originalul',
  'drafting.turn.handle': 'Trage ca să rotești selecția',
  'drafting.turn.angle': '{angle}°',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
