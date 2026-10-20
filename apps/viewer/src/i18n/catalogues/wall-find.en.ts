/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

export const wallFindEn = {
  'wall.find.label': 'Find a sheet',
  'wall.find.placeholder': 'Find a sheet or a drawing',
  'wall.find.results': 'Sheets found',
  'wall.find.none': 'No sheet matches.',
  'wall.map.label': 'Map of the Wall',
  'wall.map.hint': 'Click or drag to move the screen on the Wall',
} as const satisfies Record<string, TranslationValue>;
