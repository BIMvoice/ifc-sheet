/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { RO_ONLY_CAPTIONS_EN } from '@bimvoice/ifcsheet';
import type { TranslationValue } from '../types';

/** The Romanian-practice title block (#54): its field captions and the way to choose its layout. */
export const titleBlockRoEn = {
  // The captions are the engine's (`title-block-ro.ts`): the layout is built there.
  ...RO_ONLY_CAPTIONS_EN,
  'tblayout.useRo': 'Use the Romanian layout',
  'tblayout.roHint': 'Phase, project number, the roles that sign and an empty box each for the designer\'s and the verifier\'s stamp. It replaces the layout shown now (undo brings it back) and stays editable.',
  'wall.tb.phaseHint': 'e.g. PAC, PTh, DE (DTAC is the old name of PAC)',
} as const satisfies Record<string, TranslationValue>;
