/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** A plan's view depth: how far below its cut it sees, down to this floor by default and into the floor below when raised. */
export const planDepthEn = {
  'planDepth.label': 'View depth',
  'planDepth.toThisFloor': 'To this floor ({depth} m)',
  'planDepth.hint': 'From the cut. Empty: to this floor; raise it to see the floor below. 0 = cut only.',
} as const satisfies Record<string, TranslationValue>;
