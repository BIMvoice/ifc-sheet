/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `drawing-main-thread.en.ts` (#863). */
export const drawingMainThreadRo = {
  'drawing.mainThread.notice': 'Desenele se fac încet: procesul din fundal nu a putut fi folosit, așa că fiecare vedere se desenează în această pagină, pe rând. Planșele apar pe măsură ce vederile lor sunt gata, iar pagina se poate opri scurt cât se desenează o vedere mare.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
