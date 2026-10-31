/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** "Add a drawing" offers the reflected ceiling plan and a room's interior elevations (#657). */
export const addDrawingKindsEn = {
  'addDrawingKinds.ceiling': 'Reflected ceiling plan',
  'addDrawingKinds.ceilingHint': 'A storey seen looking up at its ceiling',
  'addDrawingKinds.interior': 'Interior elevations',
  'addDrawingKinds.interiorHint': 'The walls of one room, seen from inside',
  'addDrawingKinds.ceilingName': '{level} ceiling',
  'addDrawingKinds.noRooms': 'The model has no rooms to draw',
} as const satisfies Record<string, TranslationValue>;
