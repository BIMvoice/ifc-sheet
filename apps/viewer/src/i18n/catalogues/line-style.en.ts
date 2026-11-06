/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** LINESTYLE: a line of the generated drawing drawn in another pen for this view (#189). */
export const lineStyleEn = {
  'drafting.cmd.linestyle': 'LINESTYLE',
  'drafting.prompt.linestyle': 'Type a pen (heavy, medium, light, hairline; solid, dashed, hidden, centre; #rrggbb), then click lines of the drawing. RESET gives lines their own pen back:',
  'drafting.prompt.linestyleReset': 'Click lines to give them their own pen back (type a pen to restyle instead):',
  'drafting.msg.linestyleSet': 'The line draws in the new pen in this view. The model is unchanged.',
  'drafting.msg.linestyleReset': 'The line draws in its own pen again.',
  'drafting.msg.linestyleNoPen': 'Type a weight, a line type or a colour first.',
} as const satisfies Record<string, TranslationValue>;
