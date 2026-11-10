/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the drawing-on-a-type's-view strings of `joinery.en.ts` (#492). Term choices: `../ro-glossary.md`. */
export const joineryDraftRo = {
  'joinery.draft.view.front': 'Elevație',
  'joinery.draft.view.plan': 'Plan',
  'joinery.draft.view.section': 'Secțiune',
  'joinery.draft.title': 'Se desenează pe {view} a tipului {mark} {name}',
  'joinery.draft.done': 'Înapoi la tabel',
  'joinery.draft.hint': 'Tot ce desenați aici aparține tipului și se tipărește în fiecare tabel care îl arată. Se păstrează liniile, arcele, cercurile, textele și hașurile.',
  'joinery.draft.enter': 'Faceți dublu clic pe o vedere a unui tip ca să desenați pe ea',
  'joinery.draft.refused': 'Indisponibil într-o vedere a tabelului; desenați linii, arce, text sau hașuri.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
