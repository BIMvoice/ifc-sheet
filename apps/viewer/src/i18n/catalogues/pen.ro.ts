/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

export const penRo = {
  'wall.draw.pen': 'Creion',
  'wall.draw.pen.body': 'Apăsați și desenați cu un stylus, cu degetul sau cu mouse-ul: fiecare linie rămâne pe acest desen, în roșu, și se tipărește odată cu el. Esc oprește instrumentul.',
  'drafting.cmd.pen': 'PEN',
  'drafting.prompt.penStroke': 'Desenați o linie (Esc pentru a termina):',
  'pen.layer': 'Creion de adnotare',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
