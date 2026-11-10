/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** HIDELINE on the Wall's rail and in the drafting command line (#189). */
export const wallHideLineEn = {
  'wall.draw.hideline': 'Hide line',
  'wall.draw.hideline.body': 'Click a line of the model drawing to hide it in this view. The model is unchanged. "Show hidden" on the drawing brings it back.',
  'drafting.cmd.hideline': 'HIDELINE',
  'drafting.prompt.hideline': 'Click a line of the drawing to hide it in this view (Enter to finish):',
  'drafting.msg.hidelineDone': 'The line is hidden in this view. The model is unchanged.',
  'drafting.msg.hidelineDrawn': 'That line was drawn here, not taken from the model. Use Erase to remove it.',
} as const satisfies Record<string, TranslationValue>;
