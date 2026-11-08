/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** What each choice of the Tag tool says in a sentence ("the element's mark"), for the tool's text and its card (#168). */

import type { TranslationKey } from '@/i18n';
import type { TagField } from './element-tag';

export const TAG_FIELD_WORDS: Readonly<Record<TagField, TranslationKey>> = {
  mark: 'tagCard.field.mark', name: 'tagCard.field.name', typeName: 'tagCard.field.typeName', class: 'tagCard.field.class',
  classification: 'tagCard.field.classification', classificationTitle: 'tagCard.field.classificationTitle',
};
