/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';
export const checkEn = {
  'check.section': 'What is missing',
  'check.count': 'What is missing from the set: {count}.',
  'check.none': 'Nothing is missing from the set.',
  'check.noSheet': 'Not on a sheet',
  'check.cmd': 'CHECKSET',
  'check.refresh': 'Check the set',
  'check.go': 'Go',
  'check.fix': 'Fix',
  'check.fixing': 'Opening {view} to run {command}.',
  'check.fixFailed': 'Could not open {view}.',
  'check.msg.line': '{text}',
  'check.msg.unfinished': '{count} things are missing from the set (CHECKSET lists them). Issuing goes ahead.',
  'check.what.door': { one: 'door', other: 'doors' },
  'check.what.window': { one: 'window', other: 'windows' },
  'check.what.room': { one: 'room', other: 'rooms' },
  'check.untaggedOpenings': '{view} on {sheet}: {count} {what} without a tag.',
  'check.unlabelledRooms': '{view} on {sheet}: {count} {what} without a label.',
  'check.planNotDrawn': '{view} on {sheet} has not been drawn yet, so its doors, windows and rooms were not checked. Open it and check again.',
  'check.planNoDimensions': '{view} on {sheet} has no dimensions.',
  'check.viewNoLevelMarks': '{view} on {sheet} has no level marks.',
  'check.viewOffSheet': '{view} is on no sheet.',
  'check.emptySheet': 'Sheet {sheet} has nothing on it.',
  'check.titleBlockEmpty': 'Sheet {sheet} has no {field} in its title block.',
  'check.duplicateNumber': '{count} sheets are numbered {number}.',
  'check.sectionMarkOffSheet': 'The mark of {view} is on no plan that is on a sheet.',
  'check.detailOffSheet': '{view} is on no sheet: its mark has no sheet reference.',
  'check.danglingAnnotation': 'A tag or label in {view} points at an element that is no longer in the model.',
} as const satisfies Record<string, TranslationValue>;
