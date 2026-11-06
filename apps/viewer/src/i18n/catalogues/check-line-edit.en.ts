/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** An edit of a model line whose line is gone after the model changed (#189): `check/orphaned-line-edits.ts`. */
export const checkLineEditEn = {
  'check.orphanedLineEdit': 'The line you edited in {view} on {sheet} is no longer in the model. Your drafted line stays; check it against the new drawing.',
} as const satisfies Record<string, TranslationValue>;
