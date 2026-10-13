/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { TranslationValue } from '../types';
export const draftSetEn = {
  'draftSet.action': 'Draft set',
  'draftSet.kind.plan': 'plan',
  'draftSet.kind.section': 'section',
  'draftSet.kind.elevation': 'elevation',
  'draftSet.kind.plans': 'plans',
  'draftSet.kind.elevations': 'elevations',
  'draftSet.kind.sections': 'sections',
  'draftSet.note.noFit': 'The {kind} are larger than their sheet even at the smallest scale on the largest paper; split them or reduce the sheet by hand.',
  'draftSet.note.noModel': 'No model geometry is loaded, so no draft set was made.',
  'draftSet.note.noStoreys': 'The model has no storeys: one plan is cut at mid-height ({height} m above its lowest point).',
  'draftSet.note.leftOut': '{count} elements far from the main building were left out when sizing the drawings.',
  'draftSet.msg.summary': 'Draft set: added {newViews} views and {newSheets} sheets; {oldViews} views and {oldSheets} sheets were already there. One Undo removes what was added.',
  'draftSet.msg.line': '{text}',
} as const satisfies Record<string, TranslationValue>;
