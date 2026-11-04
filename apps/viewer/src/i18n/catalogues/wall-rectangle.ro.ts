/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `wall-rectangle.en.ts` (#672). */
export const wallRectangleRo = {
  'wall.draw.rectangle': 'Dreptunghi',
  'wall.draw.rectangle.body': 'Faceți clic în două colțuri opuse. Un dreptunghi este o formă închisă, o zonă pe care o poate umple o hașură sau o umplere plină.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
