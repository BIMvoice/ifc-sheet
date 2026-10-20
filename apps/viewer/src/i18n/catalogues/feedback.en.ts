/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

export const feedbackEn = {
  'feedback.button': 'Feedback',
  'feedback.title': 'Report a problem or suggest something',
  'feedback.opens': 'Open GitHub opens a new tab with this report filled in. You need a GitHub account to submit it, and the issue is public on the IfcSheet repository. IfcSheet sends nothing itself, holds no GitHub login, and this form records no analytics.',
  'feedback.kind': 'What is it',
  'feedback.kind.bug': 'Bug',
  'feedback.kind.suggestion': 'Suggestion',
  'feedback.kind.question': 'Question',
  'feedback.field.title': 'Title',
  'feedback.field.description': 'Description',
  'feedback.descriptionPlaceholder': 'What happened, what you expected, and the steps to get there.',
  'feedback.attach': 'Attach context',
  'feedback.attach.environment': 'App version, browser, system and WebGPU support',
  'feedback.attach.place': 'Where you are: sheet number, kind of view and the running tool',
  'feedback.never': 'Never attached: your model, file names, element names, ids, property values, or sheet and view names. Only what you type here and the ticked parts go.',
  'feedback.preview': 'What will be filled in',
  'feedback.truncated': 'Your description is longer than a GitHub link can carry, so it is cut at the end. Paste the rest into the issue.',
  'feedback.send': 'Open GitHub',
  'feedback.cancel': 'Cancel',
} as const satisfies Record<string, TranslationValue>;
