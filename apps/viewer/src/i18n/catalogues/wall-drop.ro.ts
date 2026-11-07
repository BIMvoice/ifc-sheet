/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `wall-drop.en.ts` (#168). */
export const wallDropRo = {
  'wall.drop.hint': 'Trageți un desen pe planșă ca să îl amplasați unde îl lăsați, sau faceți clic pe unul ca să îl amplasați la mijloc.',
  'wall.drop.title': 'Trageți pe planșă: conturul apare la mărime reală și se aliniază la chenar și la celelalte desene',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
