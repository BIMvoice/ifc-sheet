/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { readRevisions } from '../revision-file';
import { listField } from './define';

/** One revision of the set: a letter or number, when, what changed, who made it. */
export interface ProjectRevision {
  id: string;
  /** `A`, `B`, `01`: what the title block reads. */
  code: string;
  /** `YYYY-MM-DD`, or empty. */
  date: string;
  description: string;
  by: string;
}

declare module '../types' {
  interface ProjectFieldTypes {
    /** The project's revisions, oldest first (`revisions.ts`); a sheet's table lists the ones it is named by. */
    revisions?: ProjectRevision[];
  }
}

export const revisionsField = listField('revisions', (raw) => readRevisions(raw.revisions));
