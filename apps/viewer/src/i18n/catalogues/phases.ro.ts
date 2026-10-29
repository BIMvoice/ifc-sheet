/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the keys the IfcSheet face reaches in `phases` (#526). Term choices: `../ro-glossary.md`. */
export const phasesRo = {
  'phase.demolish': 'De demolat',
  'phase.existing': 'Existent',
  'phase.new': 'Propus',
  'phase.temporary': 'Provizoriu',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
