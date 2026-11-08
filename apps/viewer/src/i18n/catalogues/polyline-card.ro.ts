/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `polyline-card.en.ts`. Term choices: `../ro-glossary.md`. */
export const polylineCardRo = {
  'polylineCard.close': 'Închide',
  'polylineCard.undo': 'Anulează ultimul punct',
  'polylineCard.group': 'Pașii polilinei',
  'polylineCard.body': 'Faceți clic pe colțuri; Închide unește capătul cu începutul, Gata o încheie. O polilinie închisă este o zonă pe care o poate umple o hașură.',
  'drafting.prompt.polylineNext': 'Specificați punctul următor [Close / Undo] (Enter pentru a termina):',
  'plainHints.polylineNext': 'Alegeți punctul următor. Închide unește capătul cu începutul, Anulează ultimul punct retrage ultimul clic. Alegeți Gata când ați terminat.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
