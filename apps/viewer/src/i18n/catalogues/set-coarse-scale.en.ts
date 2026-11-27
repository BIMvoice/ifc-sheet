/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** Why a sheet of the set is coarser than 1:200: its drawings are larger than its paper at 1:200 (`scale-reason.ts`). Romanian: `set-coarse-scale.ro.ts`. */
export const setCoarseScaleEn = {
  'wall.reason.coarse': '1 : {scale}, the largest that fits {paper}; at 1 : {set} the drawings are larger than it',
} as const satisfies Record<string, TranslationValue>;
