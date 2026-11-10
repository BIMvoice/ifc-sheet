/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `tracking.en.ts` (#667). */
export const trackingRo = {
  'tracking.toggle': 'Urmărire',
  'tracking.hint': 'Oprește cursorul pe un colț ca să urmărești din el',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
