/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { TITLE_BLOCK_CAPTIONS_RO } from '@bimvoice/ifcsheet';
import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `title-block-ro.en.ts`. Term choices: `../ro-glossary.md`. */
export const titleBlockRoRo = {
  'tbro.generalDesigner': TITLE_BLOCK_CAPTIONS_RO['tbro.generalDesigner'],
  'tbro.projectManager': TITLE_BLOCK_CAPTIONS_RO['tbro.projectManager'],
  'tbro.designer': TITLE_BLOCK_CAPTIONS_RO['tbro.designer'],
  'tbro.phase': TITLE_BLOCK_CAPTIONS_RO['tbro.phase'],
  'tbro.projectNumber': TITLE_BLOCK_CAPTIONS_RO['tbro.projectNumber'],
  'tbro.stampDesigner': TITLE_BLOCK_CAPTIONS_RO['tbro.stampDesigner'],
  'tbro.stampVerifier': TITLE_BLOCK_CAPTIONS_RO['tbro.stampVerifier'],
  'tblayout.useRo': 'Folosește cartușul pentru România',
  'tblayout.roHint': 'Faza, numărul proiectului, rolurile care semnează și câte un chenar gol pentru ștampila proiectantului și a verificatorului. Înlocuiește macheta de acum (anularea o readuce) și rămâne modificabilă.',
  'wall.tb.phaseHint': 'de ex. PAC, PTh, DE (DTAC este denumirea veche a PAC)',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
