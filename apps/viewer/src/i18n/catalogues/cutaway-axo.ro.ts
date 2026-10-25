/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/**
 * Romanian for `cutaway-axo.en.ts` (#97). "Cut height" is "înălțimea de
 * secționare" and a storey a "nivel", as in `../ro-glossary.md`; storey names
 * come from the IFC and are not translated.
 */
export const cutawayAxoRo = {
  'cutawayAxo.add': 'Axonometrie secționată',
  'cutawayAxo.addHint': 'Un nivel văzut dintr-un colț, secționat',
  'cutawayAxo.storey': 'Nivel',
  'cutawayAxo.cutHeight': 'Înălțimea de secționare deasupra pardoselii, m',
  'cutawayAxo.create': 'Adăugați desenul',
  'cutawayAxo.viewName': '{storey}, axonometrie secționată',
  'cutawayAxo.card': 'Secționarea nivelului',
  'cutawayAxo.scaleNote': 'Desenată la scara nominală: o muchie verticală măsoară 1:{scale}.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
