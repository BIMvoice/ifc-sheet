/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { optionalField } from './define';

declare module '../types' {
  interface ProjectFieldTypes {
    /**
     * The language tag the project's generated names (sheets, views, view templates) were made in (`ro`), recorded when the
     * starting set is made. Names are stored as plain text and never rewritten; this is what a command-line build reads to
     * name a new set the way the app would (`@bimvoice/ifcsheet` `generateDefaultSet`). Absent: not recorded.
     */
    language?: string;
  }
}

export const languageField = optionalField('language', (raw) => (typeof raw.language === 'string' && raw.language.trim() ? { language: raw.language.trim() } : {}));
