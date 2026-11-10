/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `wall-edit-tools.en.ts` (#189). Term choices: `../ro-glossary.md`. */
export const wallEditToolsRo = {
  'wall.draw.trim': 'Tăiere',
  'wall.draw.trim.body': 'Faceți clic pe partea de linie de tăiat, până la cea mai apropiată linie care o intersectează. Merge pe liniile desenate și pe liniile modelului.',
  'wall.draw.extend': 'Prelungire',
  'wall.draw.extend.body': 'Faceți clic lângă capătul unei linii ca să o prelungiți până la următoarea linie din cale. Merge pe liniile desenate și pe liniile modelului.',
  'wall.draw.fillet': 'Racordare',
  'wall.draw.fillet.body': 'Faceți clic pe două linii ca să rotunjiți colțul lor. Setați raza în câmpul de mai jos; 0 dă un colț ascuțit. Merge pe liniile desenate și pe liniile modelului.',
  'wall.draw.offset': 'Decalare',
  'wall.draw.offset.body': 'Setați distanța în câmpul de mai jos, faceți clic pe o linie, apoi pe partea spre care se copiază. Linia modelului rămâne și se desenează copia.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
