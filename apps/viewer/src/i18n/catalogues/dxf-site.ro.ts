/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `dxf-site.en.ts` (#182). Term choices: `../ro-glossary.md`. */
export const dxfSiteRo = {
  'dxfSite.place': 'Poziționare după georeferențierea modelului',
  'dxfSite.placed': 'DXF-ul este poziționat după conversia de hartă a modelului.',
  'dxfSite.noGeoref': 'Modelul nu are o conversie de hartă utilizabilă. Aliniați DXF-ul prin două puncte.',
  'dxfSite.locked': 'DXF-ul este blocat. Deblocați-l pentru a-l poziționa.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
