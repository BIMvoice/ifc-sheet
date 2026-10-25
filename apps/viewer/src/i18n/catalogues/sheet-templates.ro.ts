/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `sheet-templates.en.ts`. The paper size follows in parentheses where the drawer prints the name, so it is not repeated here. Term choices: `../ro-glossary.md`. */
export const sheetTemplatesRo = {
  'wall.template.a1-plans': 'Planuri',
  'wall.template.a3-details': 'Detalii',
  'wall.template.a2-elevations-long': 'Fațade în format lung',
  'wall.template.a3-schedules': 'Tabele',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
