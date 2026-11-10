/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** An edit of a model line whose line is gone after the model changed (#189): `check/orphaned-line-edits.ts`. */
export const checkLineEditRo = {
  'check.orphanedLineEdit': 'Linia editată de dumneavoastră în {view} de pe {sheet} nu mai există în model. Linia desenată rămâne; verificați-o față de noul desen.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
