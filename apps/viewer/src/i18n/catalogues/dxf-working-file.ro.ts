/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `dxf-working-file.en.ts` (#831). Term choices: `../ro-glossary.md`. */
export const dxfWorkingFileRo = {
  'dxfWorkingFile.layers': 'Straturi DXF',
  'dxfWorkingFile.layers.pen': 'După peniță',
  'dxfWorkingFile.layers.element': 'După element',
  'dxfWorkingFile.units': 'Unități DXF',
  'dxfWorkingFile.units.paper': 'Hârtie (mm)',
  'dxfWorkingFile.units.model': 'Model 1:1 (m)',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
