/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `tag-shows.en.ts`. Term choices: `../ro-glossary.md`. */
export const tagShowsRo = {
  'tagShows.label': 'Eticheta arată',
  'tagShows.hint': 'Nume este numele IFC (Name) al elementului. Numele tipului este Name al tipului său (IfcRelDefinesByType). Clasa este clasa lui IFC.',
  'tagShows.mark': 'Marcaj',
  'tagShows.name': 'Nume (Name IFC)',
  'tagShows.class': 'Clasă',
  'atype.tag.typeName': 'Numele tipului',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
