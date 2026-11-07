/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** Placing a view by dragging it onto the sheet (#168). */
export const wallDropEn = {
  'wall.drop.hint': 'Drag a drawing onto the sheet to place it where you let go, or click one to place it in the middle.',
  'wall.drop.title': 'Drag onto the sheet: its outline shows at true size and snaps to the frame and the other drawings',
} as const satisfies Record<string, TranslationValue>;
