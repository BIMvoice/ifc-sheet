/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The names of the sheet templates every project has (`BUILT_IN_TEMPLATES` in the engine package, whose `name` stays the English fallback). The drawer shows these; a template the person saved keeps the name they gave it. */
export const sheetTemplatesEn = {
  'wall.template.a1-plans': 'A1 plans',
  'wall.template.a3-details': 'A3 details',
  'wall.template.a2-elevations-long': 'A2 elevations long',
  'wall.template.a3-schedules': 'A3 schedules',
} as const satisfies Record<string, TranslationValue>;
