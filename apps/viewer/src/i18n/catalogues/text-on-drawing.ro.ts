/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `text-on-drawing.en.ts`. */
export const textOnDrawingRo = {
  'textOnDrawing.prompt': 'Scrieți textul acolo unde se tipărește (Shift+Enter pentru rând nou, Enter pentru a termina, Esc pentru a renunța)',
  'textOnDrawing.leaderBend': 'Faceți clic pe frângere, sub orice unghi',
  'textOnDrawing.leaderEnd': 'Faceți clic pe capătul celui de-al doilea segment sau încă o dată pe frângere (Fără frângere) pentru o linie de indicație dreaptă',
  'textOnDrawing.noBend': 'Fără frângere',
  'textOnDrawing.editor': 'Text nou',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
