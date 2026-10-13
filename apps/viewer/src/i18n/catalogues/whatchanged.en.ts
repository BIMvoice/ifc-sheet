/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';
export const whatChangedEn = {
  'whatchanged.cmd': 'WHATCHANGED',
  'whatchanged.msg.line': '{text}',
  'whatchanged.noModel': 'No model is loaded to compare.',
  'whatchanged.noBaseline': 'The project has no earlier state of the model to compare with, so the model as it is now is recorded as that state. Load the new version, then run WHATCHANGED again.',
  'whatchanged.against.issue': 'Compared with {name}, issued {date}: {count} elements changed in the model.',
  'whatchanged.against.loaded': 'Compared with the model as it was recorded earlier: {count} elements changed in the model.',
  'whatchanged.sheet': { one: '{number}: {count} change', other: '{number}: {count} changes' },
  'whatchanged.sheetNone': '{number}: no changes.',
  'whatchanged.nothing': 'Nothing that the sheets show has changed.',
  'whatchanged.item': '  {name} ({class}): {what}',
  'whatchanged.annotationLost': '  In {view}: an annotation of {name}, which is no longer in the model.',
  'whatchanged.annotationChanged': '  In {view}: an annotation of {name}, which {what}.',
  'whatchanged.kind.added': 'added',
  'whatchanged.kind.removed': 'removed',
  'whatchanged.kind.moved': 'moved',
  'whatchanged.kind.reshaped': 'reshaped',
  'whatchanged.kind.property': 'changed in {sets}',
  'whatchanged.kind.type': 'type changed',
  'whatchanged.clouds': '{count} revision clouds are on the Revisions layer. WHATCHANGED CLEAR removes them; WHATCHANGED ACCEPT takes this version as the model to compare with next time.',
  'whatchanged.cleared': '{count} revision clouds removed.',
  'whatchanged.accepted': 'The model as it is now is the state later versions are compared with. {count} revision clouds removed.',
  'whatchanged.usage': 'WHATCHANGED takes nothing, CLEAR or ACCEPT, not "{arg}".',
  'whatchanged.failed': 'WHATCHANGED stopped: {reason}',
  'whatchanged.layer': 'Revisions',
} as const satisfies Record<string, TranslationValue>;
