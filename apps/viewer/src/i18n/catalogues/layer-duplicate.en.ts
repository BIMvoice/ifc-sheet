/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The Duplicate button of the layers editor (#669). */
export const layerDuplicateEn = {
  'layerDuplicate.button': 'Duplicate layer {name}',
  'layerDuplicate.name': '{name} copy',
  'layerDuplicate.nameN': '{name} copy {n}',
} as const satisfies Record<string, TranslationValue>;
