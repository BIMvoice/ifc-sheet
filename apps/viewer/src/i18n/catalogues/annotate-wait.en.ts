/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** What "Annotate the set" says while it waits for a view's drawing, when one does not come, and when it is stopped (#869). */
export const annotateWaitEn = {
  'wall.annotateWait.making': 'Waiting for the drawing of {name} to be made. The view is annotated as soon as its drawing is ready.',
  'wall.annotateWait.timedOut': 'Skipped: its drawing was not ready within {seconds} s.',
  'wall.annotateWait.stopped': 'Stopped after {done} of {total} views. What was added stays; one Undo takes it all back.',
} as const satisfies Record<string, TranslationValue>;
