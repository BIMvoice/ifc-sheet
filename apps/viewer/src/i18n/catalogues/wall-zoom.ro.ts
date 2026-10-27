/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

export const wallZoomRo = {
  'wall.zoom.label': 'Zoom pe panou',
  'wall.zoom.in': 'Mărește (+)',
  'wall.zoom.out': 'Micșorează (-)',
  'wall.zoom.percent': '{percent} %',
  'wall.zoom.trueSize': 'Arată planșa la dimensiunea hârtiei (1)',
  'wall.zoom.fitTitle': 'Arată tot setul (0)',
  'wall.zoom.toSheet': 'Mărește la {name} (Z)',
} as const satisfies Record<string, TranslationValue>;
