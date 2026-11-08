/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `dimension-chain-card.en.ts`. Term choices: `../ro-glossary.md`. */
export const dimensionChainCardRo = {
  'dimensionChain.label': 'Cote în lanț',
  'dimensionChain.help': 'Pornit: fiecare clic adaugă o cotă de la ultimul punct, într-un singur lanț. Oprit: fiecare cotă stă singură.',
  'dimensionChain.bodyOff': 'Alegeți două puncte, apoi locul liniei de cotă. Fiecare cotă stă singură, iar unealta se încheie după una.',
  'dimensionChain.hintOff': 'Alegeți două puncte, apoi linia. Unealta se încheie după o cotă; porniți Cote în lanț pentru a continua de la ultimul punct.',
  'plainHints.dimNext': 'Alegeți punctul următor pentru a continua lanțul. Opriți Cote în lanț pe cardul uneltei pentru una câte una. Alegeți Gata când ați terminat.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
