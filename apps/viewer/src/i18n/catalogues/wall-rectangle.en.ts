/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The Rectangle tool on the Wall's rail (#672). */
export const wallRectangleEn = {
  'wall.draw.rectangle': 'Rectangle',
  'wall.draw.rectangle.body': 'Click two opposite corners. A rectangle is a closed shape, a zone a hatch or a solid fill can fill.',
} as const satisfies Record<string, TranslationValue>;
