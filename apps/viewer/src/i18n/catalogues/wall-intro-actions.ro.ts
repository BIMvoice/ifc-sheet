/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** Cele două scurtături ale introducerii spre un set terminat: adnotarea lui și emiterea ca PDF. */
export const wallIntroActionsRo = {
  'wall.introActions.annotate': 'Adnotați setul: etichete, cote, niveluri',
  'wall.introActions.annotated': { one: '{count} adnotare adăugată pe {views} dintre desene.', few: '{count} adnotări adăugate pe {views} dintre desene.', other: '{count} de adnotări adăugate pe {views} dintre desene.' },
  'wall.introActions.nothing': 'Nimic de adăugat: desenele sunt deja adnotate sau nu au nimic de etichetat ori de cotat.',
} as const satisfies Record<string, TranslationValue>;
