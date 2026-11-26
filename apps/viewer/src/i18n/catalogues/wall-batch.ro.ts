/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

export const wallBatchRo = {
  'wall.batch.title': 'Se citesc modelele deschise împreună',
  'wall.batch.body': 'Setul este așezat o singură dată, din toate, când ultimul a fost citit.',
  'wall.batch.waiting': 'în așteptare',
  'wall.batch.loading': 'se citește…',
  'wall.batch.loaded': 'citit',
  'wall.batch.failed': 'nu a putut fi citit',
  'wall.batch.failedNamed': '{name} nu a putut fi citit; setul a fost așezat din celelalte modele.',
} as const satisfies Record<string, TranslationValue>;
