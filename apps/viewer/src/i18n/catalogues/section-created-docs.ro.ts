/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `section-created-docs.en.ts` (#653); the select's label is `wall.vp.placePick`. */
export const sectionCreatedDocsRo = {
  'drafting.msg.sectionCreatedSheet': 'Secțiunea a fost creată: deschideți o planșă și alegeți-o la „Alegeți un desen sau un tabel…” ca să o puneți pe planșă.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
