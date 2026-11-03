/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** Tracking lines from the corners and endpoints of the drawing (#667). */
export const trackingEn = {
  'tracking.toggle': 'Track',
  'tracking.hint': 'Rest the cursor on a corner to track from it',
} as const satisfies Record<string, TranslationValue>;
