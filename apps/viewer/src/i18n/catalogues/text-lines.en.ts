/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** Words for the drafted text on more than one line (#673). */
export const textLinesEn = {
  'textLines.prompt': 'Enter text (Shift+Enter for a new line, Enter to finish):',
} as const satisfies Record<string, TranslationValue>;
