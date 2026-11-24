/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The intro's drawn sheets and its one line for what the model lacks, in Romanian. */

import type { TranslationValue } from '../types';

export const wallIntroSheetsRo = {
  'wall.introSheets.open': 'Deschideți planșa {number} {name}',
  'wall.introSheets.more': { one: 'și încă {count} planșă', few: 'și încă {count} planșe', other: 'și încă {count} de planșe' },
  'wall.introSheets.check': { one: '{count} lucru de verificat în model', few: '{count} lucruri de verificat în model', other: '{count} de lucruri de verificat în model' },
} as const satisfies Record<string, TranslationValue>;
