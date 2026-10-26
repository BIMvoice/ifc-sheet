/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `measured-quantities.en.ts` (#74). Term choices: `../ro-glossary.md`. */
export const measuredQuantitiesRo = {
  'measuredQty.note': '* Măsurat din geometrie: modelul nu declară cantitatea. Volum: solidul închis, așa cum este desenat, cu golurile decupate. Aria peretelui: o singură față laterală, fără goluri (media celor două fețe). Aria plăcii: fața superioară, fără goluri.',
  'measuredQty.unmeasured': {
    one: 'Un element nu declară volumul, iar geometria lui nu este un singur solid închis, deci volumul lui nu a fost măsurat.',
    few: '{count} elemente nu declară volumul, iar geometria lor nu este un singur solid închis, deci volumul lor nu a fost măsurat.',
    other: '{count} de elemente nu declară volumul, iar geometria lor nu este un singur solid închis, deci volumul lor nu a fost măsurat.',
  },
  'measuredQty.column': 'Măsurat din geometrie',
  'measuredQty.volume': 'volum',
  'measuredQty.area': 'arie',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
