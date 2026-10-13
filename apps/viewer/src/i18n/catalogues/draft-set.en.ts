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
  'draftSet.title.plans': 'Plans: {names}',
  'draftSet.title.elevations': 'Elevations: {names}',
  'draftSet.title.sections': 'Sections: {names}',
  'draftSet.reason.both': '1:{scale} is the largest scale at which both {kind} fit on {paper}.',
  'draftSet.reason.only': '1:{scale} is the largest scale at which the {kind} fits on {paper}.',
  'draftSet.reason.single': '1:{scale} is the largest scale at which the biggest of the {kind} fits on {paper}; two side by side do not fit.',
  'draftSet.reason.last': '1:{scale} like the other {kind}; this is the one left over.',
  'draftSet.reason.noFit': '1:{scale} on {paper} is the smallest scale and the largest paper offered, and the {kind} are still larger than the sheet.',
  'draftSet.note.noFit': 'The {kind} do not fit at 1:{scale} on {paper}; split them or reduce the sheet by hand.',
  'draftSet.note.noModel': 'No model geometry is loaded, so no draft set was made.',
  'draftSet.note.noStoreys': 'The model has no storeys: one plan is cut at mid-height ({height} m above its lowest point).',
  'draftSet.note.leftOut': '{count} elements far from the main building were left out when sizing the drawings.',
  'draftSet.depth.section': 'A section sees to the far side of the model plus {margin} m: {depth} m.',
  'draftSet.depth.elevation': 'An elevation sees through the whole model plus {margin} m: {depth} m.',
  'draftSet.msg.summary': 'Draft set: {views} views and {sheets} sheets. Added {newViews} views and {newSheets} sheets; {oldViews} views and {oldSheets} sheets were already there. One Undo removes what was added.',
  'draftSet.msg.line': '{text}',
} as const satisfies Record<string, TranslationValue>;
