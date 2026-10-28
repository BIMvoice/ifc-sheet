/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { readProjectLanguage, unknownLanguageMessage, type NameLanguage } from '@bimvoice/ifcsheet/names';
import { optionalField } from './define';

declare module '../types' {
  interface ProjectFieldTypes {
    /**
     * The language (`ro` or `en`) the project's generated names (sheets, views, view templates) were made in, recorded when the
     * starting set is made. Names are stored as plain text and never rewritten; once it is recorded, every name the app
     * generates later (a new sheet, a view, a schedule) is in it whatever the interface language, as a command-line build
     * names a set (`@bimvoice/ifcsheet` `generateDefaultSet`). Absent: not recorded, and the interface language names.
     */
    language?: NameLanguage;
  }
}

/** Read by the validator the command line's project reader calls; a value that is not `ro`/`en` is ignored, with the command line's words. */
export const languageField = optionalField('language', (raw) => {
  const read = readProjectLanguage(raw.language);
  if (read.unknown !== undefined) console.warn(`[project] ${unknownLanguageMessage(read.unknown)}`);
  return read.language !== undefined ? { language: read.language } : {};
});
