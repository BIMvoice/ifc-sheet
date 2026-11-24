/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The clear space a label type keeps round its labels (#842), in the label type's fields of the Standards dialog. */
export const annotationLabelGapEn = {
  'label.gap': 'Gap (mm)',
  'label.gap.hint': 'Clear space round each label on paper, from 0 to 20 mm: from its element, from the other labels and from what it keeps clear of. 1.5 is the standard spacing (0.75 mm between labels).',
} as const satisfies Record<string, TranslationValue>;
