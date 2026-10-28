/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ReviewComment } from '@/review/types';
import { readComments } from '@/review/file';
import { listField } from './define';

declare module '../types' {
  interface ProjectFieldTypes {
    /** Review comments pinned on sheets (`review/`). */
    comments?: ReviewComment[];
  }
}

export const commentsField = listField('comments', (raw) => readComments(raw.comments), { presentOnly: true });
