/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `units-numbers.en.ts`. Term choices: `../ro-glossary.md`. */
export const unitsNumbersRo = {
  'wall.units.title': 'Unități și numere',
  'wall.units.intro': 'Cum se scrie fiecare cifră de pe planșe: cotele, cotele de nivel, etichetele, tabelele și indicatorii urbanistici.',
  'wall.units.lengthUnit': 'Unitatea de lungime a cotelor',
  'wall.units.lengthUnit.style': 'Cea din stilul de cotare',
  'wall.units.lengthUnit.mm': 'Milimetri (mm)',
  'wall.units.lengthUnit.cm': 'Centimetri (cm)',
  'wall.units.lengthUnit.m': 'Metri (m)',
  'wall.units.separator': 'Separatorul zecimal',
  'wall.units.separator.language': 'Cel al limbii',
  'wall.units.separator.comma': 'Virgulă (1.234,50)',
  'wall.units.separator.point': 'Punct (1,234.50)',
  'wall.units.decimals': 'Zecimale',
  'wall.units.decimals.default': 'Ca acum',
  'wall.units.decimals.length': 'Lungime',
  'wall.units.decimals.area': 'Arie',
  'wall.units.decimals.volume': 'Volum',
  'wall.units.decimals.level': 'Cota de nivel',
  'wall.units.group': 'Separă miile la arii și cantități',
  'wall.units.fixed': 'Ariile sunt în m², volumele în m³.',
  'wall.units.example': 'Exemplu: cotă de {length}, arie de {area}, cotă de nivel {level}',
  'wall.units.exports': 'Fișierele CSV păstrează numerele simple, cu punct, ca un program de calcul să le poată aduna; cu separator virgulă, coloanele sunt despărțite prin „;”. Fișierele Excel păstrează numerele și iau zecimalele alese aici.',
  'wall.units.reset': 'Înapoi la valorile implicite',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
