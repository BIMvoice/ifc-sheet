/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

export const appearanceAssignmentMembersEn = {
  'appearanceAssignmentMembers.searchLabel': 'Find an object',
  'appearanceAssignmentMembers.searchPlaceholder': 'Name or GlobalId',
  'appearanceAssignmentMembers.groupAriaLabel': 'Objects in this assignment',
  'appearanceAssignmentMembers.range': '{start}–{end} of {total}',
  'appearanceAssignmentMembers.noMatches': 'No matching objects',
  'appearanceAssignmentMembers.previousAriaLabel': 'Previous objects',
  'appearanceAssignmentMembers.previousButton': 'Previous',
  'appearanceAssignmentMembers.nextAriaLabel': 'Next objects',
  'appearanceAssignmentMembers.nextButton': 'Next',
} as const satisfies Record<string, TranslationValue>;
