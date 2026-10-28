/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

export const wallRelayoutRo = {
  'wall.relayout.kept': 'Desenele din această planșă sunt așezate manual, deci doar acesta și-a schimbat scara.',
  'wall.relayout.offer': 'Așază din nou planșa la 1 : {scale}',
} as const satisfies Record<string, TranslationValue>;
