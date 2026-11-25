/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the tray of sections (`section-tray.en.ts`). Term choices: `../ro-glossary.md`. */
export const sectionTrayRo = {
  'sectionTray.open': 'Alegeți o secțiune ({count})',
  'sectionTray.find': 'Căutați o secțiune',
  'sectionTray.none': 'Nicio secțiune nu are acest nume.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
