/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `symbol-tool-fields.en.ts`. Term choices: `../ro-glossary.md`. */
export const symbolToolFieldsRo = {
  'symbolTool.size': 'Mărime (factor)',
  'symbolTool.rotation': 'Rotire (°)',
  'symbolTool.rotationQuick': 'Alegeri rapide pentru rotire',
  'symbolTool.rotationTo': 'Rotiți la {degrees}°',
  'drafting.prompt.symbolPointFields': 'Așezați {name} (mărime ×{scale}, {rotation}°): alegeți un punct; Enter pentru a încheia',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
