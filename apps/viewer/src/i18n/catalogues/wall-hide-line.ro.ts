/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `wall-hide-line.en.ts` (#189). Term choices: `../ro-glossary.md`. */
export const wallHideLineRo = {
  'wall.draw.hideline': 'Ascunde linia',
  'wall.draw.hideline.body': 'Faceți clic pe o linie din desenul modelului ca s-o ascundeți în această vedere. Modelul rămâne neschimbat. „Arată ascunse” de pe desen o aduce înapoi.',
  'drafting.cmd.hideline': 'HIDELINE',
  'drafting.prompt.hideline': 'Faceți clic pe o linie a desenului ca s-o ascundeți în această vedere (Enter pentru a termina):',
  'drafting.msg.hidelineDone': 'Linia este ascunsă în această vedere. Modelul rămâne neschimbat.',
  'drafting.msg.hidelineDrawn': 'Linia aceasta a fost desenată aici, nu preluată din model. Folosiți Șterge ca s-o eliminați.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
