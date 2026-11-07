/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `wall-phases.en.ts`. Term choices: `../ro-glossary.md`. */
export const wallPhasesRo = {
  'wall.phases.title': 'Faze',
  'wall.phases.summaryOff': 'Nedesenat pe faze',
  'wall.phases.summaryOn': 'Desenat pe faze',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
