/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

export const wallRelayoutEn = {
  'wall.relayout.kept': 'The drawings on this sheet are placed by hand, so only this one changed scale.',
  'wall.relayout.offer': 'Lay the sheet out again at 1 : {scale}',
} as const satisfies Record<string, TranslationValue>;
