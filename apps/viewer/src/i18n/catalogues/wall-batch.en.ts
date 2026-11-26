/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The Wall while files opened together load (#863). */
export const wallBatchEn = {
  'wall.batch.title': 'Reading the models opened together',
  'wall.batch.body': 'The set is laid out once, from all of them, when the last one is in.',
  'wall.batch.waiting': 'waiting',
  'wall.batch.loading': 'reading…',
  'wall.batch.loaded': 'read',
  'wall.batch.failed': 'could not be read',
  'wall.batch.failedNamed': '{name} could not be read; the set was laid out from the other models.',
} as const satisfies Record<string, TranslationValue>;
