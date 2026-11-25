/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `annotate-wait.en.ts` (#869). Term choices: `../ro-glossary.md`. */
export const annotateWaitRo = {
  'wall.annotateWait.making': 'Se așteaptă desenul vederii {name}. Vederea este adnotată imediat ce desenul ei este gata.',
  'wall.annotateWait.timedOut': 'Omisă: desenul ei nu a fost gata în {seconds} s.',
  'wall.annotateWait.stopped': 'Oprit după {done} din {total} vederi. Ce s-a adăugat rămâne; un singur Undo anulează tot.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
