/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `underlay.en.ts` (#457). Term choices: `../ro-glossary.md`. */
export const underlayRo = {
  'underlay.open': 'Fundal',
  'underlay.title': 'Fundal',
  'underlay.hint': 'Așezați sub acest desen o pagină PDF scanată sau o imagine și trasați peste ea. Stabiliți scara dintr-o distanță cunoscută. Imaginea se păstrează în proiect, redusă la cel mult 2 MB.',
  'underlay.page': 'Pagina PDF',
  'underlay.add': 'Adăugați o pagină PDF sau o imagine',
  'underlay.importing': 'Se citește fișierul...',
  'underlay.failed': 'Fundalul nu a putut fi adăugat: {reason}',
  'underlay.pageShort': 'pagina {page}',
  'underlay.remove': 'Eliminați',
  'underlay.scaleByPoints': 'Scalați după două puncte',
  'underlay.scale': 'Scara (mm pe pixel)',
  'underlay.x': 'Centru X (m)',
  'underlay.y': 'Centru Y (m)',
  'underlay.rotation': 'Rotire (grade)',
  'underlay.opacity': 'Opacitate',
  'underlay.lock': 'Blocați poziția și scara',
  'underlay.printsHeading': 'Se tipărește pe planșa',
  'underlay.noSheets': 'Acest desen nu este încă pe o planșă.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
