/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `join-lines.en.ts` (#668). */
export const joinLinesRo = {
  'drafting.cmd.join': 'JOIN',
  'drafting.sel.join': 'Unește',
  'drafting.msg.joined': {
    one: 'Am unit liniile și poliliniile selectate ({pieces}) într-o polilinie',
    few: 'Am unit liniile și poliliniile selectate ({pieces}) în {count} polilinii',
    other: 'Am unit liniile și poliliniile selectate ({pieces}) în {count} de polilinii',
  },
  'drafting.msg.joinLeft': {
    one: 'O piesă a rămas neschimbată: capetele ei sunt la mai mult de {mm} mm de orice alt capăt',
    few: '{count} piese au rămas neschimbate: capetele lor sunt la mai mult de {mm} mm de orice alt capăt',
    other: '{count} de piese au rămas neschimbate: capetele lor sunt la mai mult de {mm} mm de orice alt capăt',
  },
  'drafting.msg.joinNone': 'Nimic de unit: nicio pereche de linii sau polilinii deschise selectate nu se ating cap la cap (în {mm} mm)',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
