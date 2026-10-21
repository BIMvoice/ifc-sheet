/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { READINESS_EN } from '@bimvoice/ifcsheet/readiness';
import type { TranslationValue } from '../types';
export const checkReadyEn = {
  'ready.title': 'What the model lacks',
  'ready.none': 'The model has what the drawing set reads: storeys, rooms, materials, quantities.',
  // What each finding says is the engine's English, the one copy (`@bimvoice/ifcsheet` `readiness.ts`).
  ...READINESS_EN,
} as const satisfies Record<string, TranslationValue>;
