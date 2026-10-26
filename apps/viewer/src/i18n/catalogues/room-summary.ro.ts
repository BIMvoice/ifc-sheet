/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the perimeter column and the area summary (#42), with the terms of `../ro-glossary.md`: arie utilă, arie construită, arie desfășurată. */
export const roomSummaryRo = {
  'roomSum.perimeter': 'Perimetru m',
  'roomSum.note.perimeter': 'Perimetru: conturul amprentei geometriei încăperii, aceeași de la care se ia și aria când modelul nu o dă; – unde încăperea nu are geometrie. Cantitatea Perimeter din model nu este citită.',
  'roomSum.heading': 'Sinteza ariilor (Su, Sc, Sd)',
  'roomSum.level': 'Nivel',
  'roomSum.su': 'Su m²',
  'roomSum.sc': 'Sc m²',
  'roomSum.sd': 'Sd m²',
  'roomSum.building': 'Total clădire',
  'roomSum.note.defs': 'Su = aria utilă (Au): suma ariilor încăperilor. Sc = aria construită (Ac): amprenta nivelului care conține ±0,00, măsurată la fața exterioară a pereților exteriori. Sd = aria desfășurată (Ad): suma ariilor construite ale tuturor nivelurilor, subsolurile incluse; linia unui nivel este aria lui construită. Aceleași cifre ca în foaia de indicatori urbanistici.',
  'roomSum.note.atLeast': '≥ marchează un nivel la care pereți, stâlpi sau planșee nu au dat contur: aria lui construită este cel puțin atât.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
