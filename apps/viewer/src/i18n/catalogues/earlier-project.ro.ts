/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the project of an earlier version of the model (`earlier-project.en.ts`). Term choices: `../ro-glossary.md`. */
export const earlierProjectRo = {
  'earlierProject.title': 'Un proiect anterior al acestui model',
  'earlierProject.body': 'Continuați {project}, salvat {time}, făcut dintr-o versiune anterioară a acestui model?',
  'earlierProject.detail': 'Planșele, vederile și adnotările lui sunt desenate pe această versiune; adnotările al căror element lipsește sunt păstrate și numărate. Salvarea automată anterioară nu se modifică, orice ați alege.',
  'earlierProject.continue': 'Continuă',
  'earlierProject.startNew': 'Începe unul nou',
  'earlierProject.continued': '{project} continuă pe această versiune a modelului.',
  'earlierProject.continuedChanged': {
    one: '{project} continuă pe această versiune a modelului; un element s-a modificat.',
    few: '{project} continuă pe această versiune a modelului; {count} elemente s-au modificat.',
    other: '{project} continuă pe această versiune a modelului; {count} de elemente s-au modificat.',
  },
  'earlierProject.lost': {
    one: 'O adnotare și-a pierdut elementul. Este păstrată.',
    few: '{count} adnotări și-au pierdut elementul. Sunt păstrate.',
    other: '{count} de adnotări și-au pierdut elementul. Sunt păstrate.',
  },
  'earlierProject.failed': 'Proiectul anterior nu a putut fi continuat: {reason}',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
