/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { TranslationValue } from '../types';

/** The Romanian-practice title block (#54): its field captions and the way to choose its layout. */
export const titleBlockRoEn = {
  'tbro.generalDesigner': 'General designer',
  'tbro.projectManager': 'Project manager',
  'tbro.designer': 'Designed by',
  'tbro.phase': 'Phase',
  'tbro.projectNumber': 'Project no.',
  'tbro.stampDesigner': 'Designer stamp',
  'tbro.stampVerifier': 'Verifier stamp',
  'tblayout.useRo': 'Use the Romanian layout',
  'tblayout.roHint': 'Phase, project number, the roles that sign and an empty box each for the designer\'s and the verifier\'s stamp. It replaces the layout shown now (undo brings it back) and stays editable.',
  'wall.tb.phaseHint': 'e.g. DTAC, PTh, DE',
} as const satisfies Record<string, TranslationValue>;
