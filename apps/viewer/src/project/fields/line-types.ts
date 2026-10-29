/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { readLineType, type CustomLineType } from '@/drafting/line-types';
import { listAt } from '../project-read';
import { listField } from './define';

declare module '../types' {
  interface ProjectFieldTypes {
    /** The project's own line types (dash patterns in paper mm) layers and drafted lines can name; the built-in ones are in code. */
    lineTypes?: CustomLineType[];
  }
}

/** The project's own line types (#496); absent: only the built-in ones. */
export const lineTypesField = listField('lineTypes', (raw) => listAt(raw, 'lineTypes').map((v, i) => readLineType(v, `/lineTypes/${i}`)), { presentOnly: true });

/** Registered by this file (`./registered.ts`): found there, not listed. */
export const registeredFields = [lineTypesField] as const;
declare module './registered' {
  interface RegisteredFieldKeys {
    lineTypes: true;
  }
}
