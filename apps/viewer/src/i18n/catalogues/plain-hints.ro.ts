/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `plain-hints.en.ts`. Term choices: `../ro-glossary.md`. */
export const plainHintsRo = {
  'plainHints.drawHint': 'Gata încheie instrumentul (merg și Esc sau Enter). Înapoi la planșă părăsește desenul.',
  'plainHints.dimensionHint': 'Faceți clic pentru a continua lanțul. Gata îl oprește (merge și Esc).',
  'plainHints.pickLine': 'Faceți clic pe o linie ca s-o ascundeți, sau apăsați din nou Ascunde o linie ca să opriți.',
  'plainHints.levelPoint': 'Faceți clic unde se așază cota de nivel. Alegeți Gata când ați terminat.',
  'plainHints.placeDoor': 'Faceți clic pe un perete ca să puneți o ușă acolo (pe baza peretelui). Alegeți Gata când ați terminat.',
  'plainHints.placeWindow': 'Faceți clic pe un perete ca să puneți o fereastră acolo (centrată pe clic). Alegeți Gata când ați terminat.',
  'plainHints.placeOpening': 'Faceți clic pe un perete ca să tăiați un gol acolo (centrat pe clic). Alegeți Gata când ați terminat.',
  'plainHints.labelElement': 'Faceți clic pe elementul de etichetat. Alegeți Gata când ați terminat.',
  'plainHints.tagElement': 'Faceți clic pe elementul de etichetat. Eticheta arată {fieldWords}; schimbați asta la Eticheta arată, pe cardul instrumentului.',
  'plainHints.tagLabel': 'Faceți clic acolo unde se așază eticheta. Eticheta arată {fieldWords}; schimbați asta la Eticheta arată, pe cardul instrumentului.',
  'plainHints.chainAdd': 'Faceți clic pe punctul de adăugat în lanț. Alegeți Gata când ați terminat.',
  'plainHints.chainRemove': 'Faceți clic pe punctul de scos din lanț. Alegeți Gata când ați terminat.',
  'plainHints.chainSplit': 'Faceți clic pe punctul unde se desparte lanțul. Alegeți Gata când ați terminat.',
  'plainHints.secondPoint': 'Faceți clic pe al doilea punct. Alegeți Gata când ați terminat.',
  'plainHints.trimPick': 'Faceți clic pe partea de tăiat. Alegeți Gata când ați terminat.',
  'plainHints.extendPick': 'Faceți clic pe capătul de prelungit. Alegeți Gata când ați terminat.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
