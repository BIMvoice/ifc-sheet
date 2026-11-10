/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `line-style.en.ts` (#189). Term choices: `../ro-glossary.md`. */
export const lineStyleRo = {
  'drafting.cmd.linestyle': 'LINESTYLE',
  'drafting.prompt.linestyle': 'Scrieți un creion (heavy, medium, light, hairline; solid, dashed, hidden, centre; #rrggbb), apoi faceți clic pe liniile desenului. RESET le dă înapoi creionul lor:',
  'drafting.prompt.linestyleReset': 'Faceți clic pe linii ca să primească înapoi creionul lor (scrieți un creion ca să le restilizați):',
  'drafting.msg.linestyleSet': 'Linia se desenează cu noul creion în această vedere. Modelul nu s-a schimbat.',
  'drafting.msg.linestyleReset': 'Linia se desenează din nou cu creionul ei.',
  'drafting.msg.linestyleNoPen': 'Scrieți mai întâi o grosime, un tip de linie sau o culoare.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
