/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** TRIM, EXTEND, FILLET and OFFSET on the Wall's rail (#189). */
export const wallEditToolsEn = {
  'wall.draw.trim': 'Trim',
  'wall.draw.trim.body': 'Click the part of a line to cut away, up to the nearest line that crosses it. Works on drawn lines and on lines of the model.',
  'wall.draw.extend': 'Extend',
  'wall.draw.extend.body': 'Click near the end of a line to lengthen it up to the next line in its way. Works on drawn lines and on lines of the model.',
  'wall.draw.fillet': 'Fillet',
  'wall.draw.fillet.body': 'Click two lines to round their corner. Set the radius in the field below; 0 makes a sharp corner. Works on drawn lines and on lines of the model.',
  'wall.draw.offset': 'Offset',
  'wall.draw.offset.body': 'Set the distance in the field below, click a line, then click the side to copy it to. A line of the model stays and the copy is drawn.',
} as const satisfies Record<string, TranslationValue>;
