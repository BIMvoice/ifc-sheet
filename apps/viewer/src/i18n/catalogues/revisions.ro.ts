/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `revisions.en.ts`. Term choices: `../ro-glossary.md`. */
export const revisionsRo = {
  'issue.currentOnly': 'Afișați doar norii de revizie ai reviziei curente a fiecărei planșe',
  'wall.draw.revcloud': 'Nor de revizie',
  'wall.draw.revcloud.body': 'Faceți clic în două colțuri opuse: în jurul lor se desenează un nor pentru revizia aleasă mai jos.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
