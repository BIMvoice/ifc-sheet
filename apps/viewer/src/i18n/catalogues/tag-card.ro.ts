/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `tag-card.en.ts`. Term choices: `../ro-glossary.md`. */
export const tagCardRo = {
  'tagCard.sentence': 'Eticheta arată {field}.',
  'tagCard.field.mark': 'marcajul elementului',
  'tagCard.field.name': 'numele IFC (Name) al elementului',
  'tagCard.field.typeName': 'numele tipului său',
  'tagCard.field.class': 'clasa sa IFC',
  'tagCard.field.classification': 'codul său de clasificare',
  'tagCard.field.classificationTitle': 'titlul său de clasificare',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
