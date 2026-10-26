/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ENGINE_NAMES_RO } from '@bimvoice/ifcsheet/names';
import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the names the app gives what it creates (`names.en.ts`). Term choices: `../ro-glossary.md`. */
export const namesRo = {
  // The names the drawing-set engine gives what it makes; its Romanian is the one copy (`@bimvoice/ifcsheet` `names.ts`), so a command-line build names a set the same way.
  ...ENGINE_NAMES_RO,
  'names.view.detail': 'Detaliu {number} - {source}',
  'names.issue.default': 'Emitere {n}',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
