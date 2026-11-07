/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `wall-chamfer.en.ts` (#189). Term choices: `../ro-glossary.md`. */
export const wallChamferRo = {
  'wall.edit': 'Editare',
  'wall.draw.chamfer': 'Șanfrenare',
  'wall.draw.chamfer.body': 'Faceți clic pe două linii ca să tăiați colțul lor. Scrieți mai întâi o distanță; 0 dă un colț ascuțit. Merge pe liniile desenate și pe liniile modelului.',
  'drafting.cmd.chamfer': 'CHAMFER',
  'drafting.prompt.chamferFirst': 'Selectați prima linie (distanța {distance}) sau scrieți o distanță:',
  'drafting.prompt.chamferSecond': 'Selectați a doua linie:',
  'drafting.msg.chamferLinesOnly': 'Șanfrenarea funcționează pe linii.',
  'drafting.msg.chamferFailed': 'Aceste linii nu se pot șanfrena cu distanța dată.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
