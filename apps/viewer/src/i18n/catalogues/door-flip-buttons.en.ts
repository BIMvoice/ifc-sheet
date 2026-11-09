/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The flip buttons on a selected door's plan symbol (#679). */
export const doorFlipButtonsEn = {
  'doorflip.group': 'Flip this door',
  'doorflip.swing': 'Flip swing',
  'doorflip.hinge': 'Flip hinge side',
} as const satisfies Record<string, TranslationValue>;
