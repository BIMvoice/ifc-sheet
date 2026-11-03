/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { TAG_FIELDS, type TagFieldName } from '@/catalogue/types';
import { optionalField } from './define';

declare module '../types' {
  interface ProjectFieldTypes {
    /**
     * What the TAG tool shows on a tag it places when no tag type is chosen: the mark, the Name, the type's name, the class (#676).
     * Absent: the mark. A tag already placed keeps the field it was made with (`tagField` in its params).
     */
    tagField?: TagFieldName;
  }
}

/** Written only when the project chose something other than the mark; a value that is not a tag field loads as absent. */
export const tagFieldField = optionalField('tagField', (raw) => {
  const value = TAG_FIELDS.find((f) => f === raw.tagField);
  return value && value !== 'mark' ? { tagField: value } : {};
});

/** Registered by this file (`./registered.ts`): found there, not listed. */
export const registeredFields = [tagFieldField] as const;
declare module './registered' {
  interface RegisteredFieldKeys {
    tagField: true;
  }
}
