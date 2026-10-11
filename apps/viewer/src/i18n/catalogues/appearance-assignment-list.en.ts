/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

export const appearanceAssignmentListEn = {
  'appearanceAssignmentList.sectionAriaLabel': 'Appearance assignments',
  'appearanceAssignmentList.heading': 'Assignments',
  'appearanceAssignmentList.description':
    'Later assignments replace earlier ones on overlapping objects. Excluding an object here keeps any earlier assignment.',
  'appearanceAssignmentList.assignmentAriaLabel': 'Assignment {position}: {sourceName} on {modelName}',
  'appearanceAssignmentList.moveEarlierAriaLabel': 'Move assignment {position} earlier',
  'appearanceAssignmentList.moveLaterAriaLabel': 'Move assignment {position} later',
  'appearanceAssignmentList.removeAriaLabel': 'Remove assignment {position}',
  'appearanceAssignmentList.summary': '{products} · {excluded} · {overridden}',
  'appearanceAssignmentList.summaryProducts': { one: '{count} object', other: '{count} objects' },
  'appearanceAssignmentList.summaryExcluded': { one: '{count} excluded', other: '{count} excluded' },
  'appearanceAssignmentList.summaryOverridden': {
    one: '{count} replaced by a later assignment',
    other: '{count} replaced by later assignments',
  },
  'appearanceAssignmentList.reviewAriaLabel': 'Review objects for assignment {position}',
  'appearanceAssignmentList.reviewButton': 'Review objects and exceptions',
} as const satisfies Record<string, TranslationValue>;
