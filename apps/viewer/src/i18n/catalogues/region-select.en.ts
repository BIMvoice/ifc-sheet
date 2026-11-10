/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The line on a drawing that says how to select several elements at once (#666). */
export const regionSelectEn = {
  'regionSelect.hint': 'Drag on empty space to select: right for what is inside the box, left for what it touches. Alt + drag draws a loop. Shift adds. The middle button pans.',
} as const satisfies Record<string, TranslationValue>;
