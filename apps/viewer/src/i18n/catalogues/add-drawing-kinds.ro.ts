/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `add-drawing-kinds.en.ts` (#657): "Plan de plafoane (reflectat)" as in `../ro-glossary.md`. */
export const addDrawingKindsRo = {
  'addDrawingKinds.ceiling': 'Plan de plafoane (reflectat)',
  'addDrawingKinds.ceilingHint': 'Un nivel văzut privind în sus, spre plafon',
  'addDrawingKinds.interior': 'Fațade interioare',
  'addDrawingKinds.interiorHint': 'Pereții unei camere, văzuți dinăuntru',
  'addDrawingKinds.ceilingName': 'Plafon {level}',
  'addDrawingKinds.noRooms': 'Modelul nu are camere de desenat',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
