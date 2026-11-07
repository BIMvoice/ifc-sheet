/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `section-created-docs.en.ts` (#653); the list's heading is `wall.vp.place`. */
export const sectionCreatedDocsRo = {
  'drafting.msg.sectionCreatedSheet': 'Secțiunea a fost creată: deschideți o planșă și trageți-o din „Amplasează pe această planșă” pe planșă, sau faceți clic pe ea acolo.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
