/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the handover package (`handover.en.ts`). Term choices: `../ro-glossary.md`. */
export const handoverRo = {
  'handover.action': 'Predă (ZIP)',
  'handover.hint': 'Emite setul ca mai sus și îl împachetează cu IFC-ul așa cum a fost încărcat, fiecare tabel ca XLSX și lista de desene ca XLSX. Desenele merg ca DXF; DWG vine cu #52.',
  'handover.pattern': 'Tiparul denumirii fișierelor',
  'handover.pattern.hint': 'Jetoane: {tokens}. Denumirile sunt ASCII simplu, fără bară oblică, de cel mult 100 de caractere; două fișiere cu aceeași denumire primesc (2).',
  'handover.pattern.example': 'Exemplu: {name}',
  'handover.pattern.reset': 'Implicit',
  'handover.msg.done': 'Pachet de predare: {count} fișiere în {name}.',
  'issue.file.handover': 'predare',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
