/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** "Label all" beside "Draw with it" on a label type (#842): LABELALL with that type on the drawing in front. */
export const labelAllTypeEn = {
  'atype.labelAll': 'Label all',
  'atype.labelAll.hint': 'Label every element of a class (or run a label preset) on the drawing in front, or the one chosen on the sheet',
  'atype.labelAll.noDrawing': 'Open a drawing, or choose one on the sheet, then press Label all again. The label type is now the current one.',
} as const satisfies Record<string, TranslationValue>;
