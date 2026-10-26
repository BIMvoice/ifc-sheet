/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The ByggesaksBIM (Norway) opt-in and its findings' controls (#372). The findings' sentences are the engine's English, in `READINESS_EN` (`check-ready.en.ts`). */
export const byggesaksbimEn = {
  'ready.byggesaksbim.label': 'ByggesaksBIM (Norge)',
  'ready.byggesaksbim.hint': 'Checks the model against the seven required (Obligatorisk) items of DiBK\'s P13 eByggesak report: matrikkel number, BYA, building type, BTA and BRA per storey, bruksenhet zones, lift type. What fails is listed above. Off: nothing is run.',
  'ready.byggesaksbim.select': 'Select the first one',
} as const satisfies Record<string, TranslationValue>;
