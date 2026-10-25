/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** Annotate the set (#333): TAGALL, DIMALL and LEVELALL on every view of the right kind, from the Wall. What each command says on a view is its own message (`annotate-all.en.ts`). */
export const annotateSetEn = {
  'wall.annotate.open': 'Annotate the set',
  'wall.annotate.title': 'Annotate the set',
  'wall.annotate.hint': 'Runs the commands on every view of the right kind with no view open, each on its own drawing, as if you ran it there. What a view has already is not added a second time. One Undo takes the whole run back.',
  'wall.annotate.tagall': 'Tag every plan (TAGALL)',
  'wall.annotate.dimall': 'Dimension every plan (DIMALL)',
  'wall.annotate.levelall': 'Level marks on every elevation and section (LEVELALL)',
  'wall.annotate.run': 'Annotate the set',
  'wall.annotate.stop': 'Stop',
  'wall.annotate.nothingChosen': 'Choose at least one command.',
  'wall.annotate.noViews': 'The set has no view these commands run on.',
  'wall.annotate.progress': 'Annotating view {done} of {total}: {name}',
  'wall.annotate.result.total': 'Added {added} on {views} of {total} views.',
  'wall.annotate.result.stopped': 'Stopped before the last views.',
  'wall.annotate.status.added': 'Added {count}',
  'wall.annotate.status.already': 'Already annotated',
  'wall.annotate.status.skipped': 'Skipped',
  'wall.annotate.reason.noDrawing': 'This view has no drawing to annotate ({error}).',
  'wall.annotate.reason.failed': 'This view could not be annotated ({error}).',
  'wall.annotate.reason.nothing': 'Nothing to annotate on this view.',
} as const satisfies Record<string, TranslationValue>;
