/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

export const wallZoomEn = {
  'wall.zoom.label': 'Zoom the Wall',
  'wall.zoom.in': 'Zoom in (+)',
  'wall.zoom.out': 'Zoom out (-)',
  'wall.zoom.percent': '{percent} %',
  'wall.zoom.trueSize': 'Show the sheet at its paper size (1)',
  'wall.zoom.fitTitle': 'Show the whole set (0)',
  'wall.zoom.toSheet': 'Zoom to {name} (Z)',
} as const satisfies Record<string, TranslationValue>;
