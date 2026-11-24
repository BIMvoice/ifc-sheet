/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The intro's drawn sheets and its one line for what the model lacks. */

import type { TranslationValue } from '../types';

export const wallIntroSheetsEn = {
  'wall.introSheets.open': 'Open sheet {number} {name}',
  'wall.introSheets.more': { one: 'and {count} more sheet', other: 'and {count} more sheets' },
  'wall.introSheets.check': { one: '{count} thing to check in the model', other: '{count} things to check in the model' },
} as const satisfies Record<string, TranslationValue>;
