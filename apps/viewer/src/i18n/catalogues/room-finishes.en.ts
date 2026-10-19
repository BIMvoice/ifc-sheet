/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

export const roomFinishesEn = {
  'finishes.newName': 'Room finishes',
  'finishes.number': 'No.',
  'finishes.room': 'Room',
  'finishes.level': 'Level',
  'finishes.floor': 'Floor',
  'finishes.wall': 'Wall',
  'finishes.ceiling': 'Ceiling',
  'finishes.area': 'Area m²',
  'finishes.empty': 'The loaded models have no rooms (IfcSpace).',
} as const satisfies Record<string, TranslationValue>;
