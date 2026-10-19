/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

export const reviewEn = {
  'review.tool': 'Comment',
  'review.tool.hint': 'Click on the sheet where the comment belongs',
  'review.title': 'Comments',
  'review.name': 'Your name',
  'review.text': 'Comment',
  'review.placeholder': 'Type a comment, Enter to save',
  'review.pin': 'Comment {n} by {author}',
  'review.anon': 'Someone',
  'review.done': 'Mark done',
  'review.reopen': 'Reopen',
  'review.delete': 'Delete comment',
  'review.close': 'Close',
  'review.reply': 'Reply',
  'review.replyPlaceholder': 'Reply, Enter to send',
  'review.status.done': 'Done',
  'review.status.open': 'Open',
  'review.onElement': 'On a model element',
  'review.badge': 'Open comments on {name}: {count}',
  'review.openCount': '{count} open',
  'review.showDone': 'Show done',
  'review.empty': 'No open comments.',
  'review.bcf.export': 'Export BCF',
  'review.bcf.import': 'Import BCF',
  'review.bcf.exported': '{count} of {total} comments sit on a model element and went into the BCF file.',
  'review.bcf.none': 'No comment sits on a model element, so there is nothing to export.',
  'review.bcf.imported': '{count} topics became comments; {unplaced} show no element on any sheet and were left out.',
  'review.bcf.failed': 'Could not read that BCF file.',
} as const satisfies Record<string, TranslationValue>;
