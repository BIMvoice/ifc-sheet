/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `label-all-type.en.ts` (#842). */
export const labelAllTypeRo = {
  'atype.labelAll': 'Etichetați tot',
  'atype.labelAll.hint': 'Etichetați fiecare element al unei clase (sau rulați o presetare de etichete) pe desenul din față sau pe cel ales pe planșă',
  'atype.labelAll.noDrawing': 'Deschideți un desen sau alegeți unul pe planșă, apoi apăsați din nou Etichetați tot. Tipul de etichetă este acum cel curent.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
