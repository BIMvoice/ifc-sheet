/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `annotation-label-gap.en.ts` (#842). */
export const annotationLabelGapRo = {
  'label.gap': 'Spațiu liber (mm)',
  'label.gap.hint': 'Spațiul liber din jurul fiecărei etichete pe hârtie, de la 0 la 20 mm: față de elementul ei, față de celelalte etichete și față de ce ocolește. 1,5 este spațierea standard (0,75 mm între etichete).',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
