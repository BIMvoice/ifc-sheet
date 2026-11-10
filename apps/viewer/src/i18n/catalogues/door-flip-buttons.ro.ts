/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `door-flip-buttons.en.ts`. Term choices: `../ro-glossary.md`. */
export const doorFlipButtonsRo = {
  'doorflip.group': 'Inversează această ușă',
  'doorflip.swing': 'Inversează sensul de deschidere',
  'doorflip.hinge': 'Inversează partea balamalelor',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
