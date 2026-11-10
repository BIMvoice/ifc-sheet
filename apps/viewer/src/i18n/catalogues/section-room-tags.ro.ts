/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `section-room-tags.en.ts` (#677). Term choices: `../ro-glossary.md`. */
export const sectionRoomTagsRo = {
  'drafting.msg.tagAllNoRoomsCut': 'Această vedere nu taie nicio încăpere, deci nu s-a desenat nicio etichetă de încăpere. O secțiune etichetează încăperile prin care trece planul ei; o fațadă exterioară vede încăperile doar din afară.',
  'drafting.msg.tagAllOverLines': {
    one: 'O etichetă de încăpere nu are un loc liber de liniile acestei vederi, deci stă peste una. Mutați-o manual.',
    few: '{count} etichete de încăpere nu au un loc liber de liniile acestei vederi, deci stau peste una. Mutați-le manual.',
    other: '{count} de etichete de încăpere nu au un loc liber de liniile acestei vederi, deci stau peste una. Mutați-le manual.',
  },
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
