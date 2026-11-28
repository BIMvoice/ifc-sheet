/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The project of an earlier version of the model, offered in a fresh tab (#922, `whatchanged/continue-earlier.ts`). */
export const earlierProjectEn = {
  'earlierProject.title': 'An earlier project of this model',
  'earlierProject.body': 'Continue {project}, saved {time}, made from an earlier version of this model?',
  'earlierProject.detail': 'Its sheets, views and annotations are drawn on this version; annotations whose element is gone are kept and counted. The earlier autosave is not changed, whichever you choose.',
  'earlierProject.continue': 'Continue',
  'earlierProject.startNew': 'Start new',
  'earlierProject.continued': '{project} continued on this version of the model.',
  'earlierProject.continuedChanged': {
    one: '{project} continued on this version of the model; {count} element changed.',
    other: '{project} continued on this version of the model; {count} elements changed.',
  },
  'earlierProject.lost': {
    one: '{count} annotation lost its element. It is kept.',
    other: '{count} annotations lost their element. They are kept.',
  },
  'earlierProject.failed': 'The earlier project could not be continued: {reason}',
} as const satisfies Record<string, TranslationValue>;
