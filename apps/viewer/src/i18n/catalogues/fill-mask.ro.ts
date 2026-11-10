/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `fill-mask.en.ts` (#681). */
export const fillMaskRo = {
  'drafting.cmd.fill': 'FILL',
  'drafting.sel.fill': 'Umple cu alb',
  'drafting.sel.fillColour': 'Umple cu o culoare',
  'drafting.msg.filled': '{count} umplute cu {colour}',
  'drafting.msg.fillNone': 'Nimic de umplut: alege o polilinie închisă, un dreptunghi sau un cerc',
  'drafting.msg.fillColour': 'Nu e o culoare: scrie white, black, red… sau #rrggbb',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
