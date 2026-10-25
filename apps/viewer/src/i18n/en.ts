/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { enAE } from './barrels/en-a-e';
import { enFL } from './barrels/en-f-l';
import { enMR } from './barrels/en-m-r';
import { enSZ } from './barrels/en-s-z';

/** English is assembled from feature catalogues so no locale becomes a monolith. */
export const en = {
  ...enAE,
  ...enFL,
  ...enMR,
  ...enSZ,
} as const;

export type TranslationKey = keyof typeof en;
