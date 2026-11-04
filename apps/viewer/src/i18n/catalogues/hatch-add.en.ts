/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The "Add a hatch pattern" button beside every hatch choice (#671): loads a .pat file into the project. */
export const hatchAddEn = {
  'hatchadd.button': 'Add a hatch pattern',
  'hatchadd.title': 'Load a .pat file. Its patterns join this list, the first one is picked at once, and they are saved with the project.',
} as const satisfies Record<string, TranslationValue>;
