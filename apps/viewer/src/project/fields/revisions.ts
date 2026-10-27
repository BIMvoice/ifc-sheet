/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ProjectRevision } from '@bimvoice/ifcsheet';
import { readRevisions } from '@bimvoice/ifcsheet';
import { listField } from './define';

/** The record is the engine's (`packages/ifcsheet/src/revisions.ts`): the PDF's title block prints the same revision. */
export type { ProjectRevision };

declare module '../types' {
  interface ProjectFieldTypes {
    /** The project's revisions, oldest first (`revisions.ts`); a sheet's table lists the ones it is named by. */
    revisions?: ProjectRevision[];
  }
}

export const revisionsField = listField('revisions', (raw) => readRevisions(raw.revisions));
