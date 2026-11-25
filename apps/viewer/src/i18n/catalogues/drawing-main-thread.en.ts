/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The notice shown while drawings are made on the page itself because the drawing worker could not be used (#863). */
export const drawingMainThreadEn = {
  'drawing.mainThread.notice': 'Drawings are being made slowly: the background worker could not be used, so each view is drawn on this page, one at a time. The sheets appear as their views are ready, and the page may pause while a large view is drawn.',
} as const satisfies Record<string, TranslationValue>;
