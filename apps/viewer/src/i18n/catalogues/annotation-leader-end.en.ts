/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The end a label type's leader carries at its tip (#842), in the label type's fields of the Standards dialog. */
export const annotationLeaderEndEn = {
  'label.leaderEnd': 'Leader end',
  'label.leaderEnd.arrow': 'Arrow',
  'label.leaderEnd.dot': 'Dot',
  'label.leaderEnd.none': 'None',
} as const satisfies Record<string, TranslationValue>;
