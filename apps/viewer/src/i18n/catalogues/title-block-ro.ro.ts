/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `title-block-ro.en.ts`. Term choices: `../ro-glossary.md`. */
export const titleBlockRoRo = {
  'tbro.generalDesigner': 'Proiectant general',
  'tbro.projectManager': 'Șef proiect',
  'tbro.designer': 'Proiectat',
  'tbro.phase': 'Faza',
  'tbro.projectNumber': 'Proiect nr.',
  'tbro.stampDesigner': 'Ștampilă proiectant',
  'tbro.stampVerifier': 'Ștampilă verificator',
  'tblayout.useRo': 'Folosește cartușul pentru România',
  'tblayout.roHint': 'Faza, numărul proiectului, rolurile care semnează și câte un chenar gol pentru ștampila proiectantului și a verificatorului. Înlocuiește macheta de acum (anularea o readuce) și rămâne modificabilă.',
  'wall.tb.phaseHint': 'de ex. PAC, PTh, DE (DTAC este denumirea veche a PAC)',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
