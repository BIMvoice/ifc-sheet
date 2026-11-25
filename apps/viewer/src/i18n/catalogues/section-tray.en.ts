/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The tray of sections under a sheet of sections, when the model suggests too many to lay out as buttons. Romanian: `section-tray.ro.ts`. */
export const sectionTrayEn = {
  'sectionTray.open': 'Choose a section ({count})',
  'sectionTray.find': 'Find a section',
  'sectionTray.none': 'No section has that name.',
} as const satisfies Record<string, TranslationValue>;
