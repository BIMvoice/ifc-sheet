/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `text-lines.en.ts`. */
export const textLinesRo = {
  'textLines.prompt': 'Scrieți textul (Shift+Enter pentru rând nou, Enter pentru a termina):',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
