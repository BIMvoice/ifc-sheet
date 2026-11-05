/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The contour interval of a site plan's terrain (#182). */
export const contoursEn = {
  'contours.interval': 'Contour interval (m)',
  'contours.intervalHint': 'Every fifth contour is drawn heavier; 0 for none',
} as const satisfies Record<string, TranslationValue>;
