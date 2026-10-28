/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

export const wallCompareEn = {
  'wall.compare.pick': 'Compare {name} with another sheet',
  'wall.compare.picking': 'Now choose the sheet to compare {name} with.',
  'wall.compare.cancel': 'Cancel',
  'wall.compare.title': 'Compare two sheets',
  'wall.compare.left': 'Left sheet',
  'wall.compare.right': 'Right sheet',
  'wall.compare.paneLeft': 'Left sheet, {name}',
  'wall.compare.paneRight': 'Right sheet, {name}',
  'wall.compare.together': 'Pan together',
  'wall.compare.swap': 'Swap the two sheets',
  'wall.compare.close': 'Back to the Wall (Esc)',
  'wall.compare.zoom': 'Zoom of both sheets',
} as const satisfies Record<string, TranslationValue>;
