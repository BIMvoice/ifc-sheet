/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the visible ways out (`wall-exits.en.ts`). Term choices: `../ro-glossary.md`. */
export const wallExitsRo = {
  'wall.tool.done': 'Gata',
  'wall.vp.done': 'Gata',
  'drafting.done': 'Gata',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
