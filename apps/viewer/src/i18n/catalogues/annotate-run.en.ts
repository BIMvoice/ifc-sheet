/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** What "Annotate the set" says when a run does not start or stops on an error (#869). */
export const annotateRunEn = {
  'wall.annotateRun.failed': 'Annotating the set stopped on an error: {message}',
  'wall.annotateRun.nothingOn': 'No annotation is switched on. Switch on tags, dimensions or level marks under Annotate the set in the top bar.',
} as const satisfies Record<string, TranslationValue>;
