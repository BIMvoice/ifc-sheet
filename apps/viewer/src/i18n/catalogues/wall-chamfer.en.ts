/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** CHAMFER on the Wall's rail and in the drafting command line, and the rail's Edit section (#189). */
export const wallChamferEn = {
  'wall.edit': 'Edit',
  'wall.draw.chamfer': 'Chamfer',
  'wall.draw.chamfer.body': 'Click two lines to cut their corner. Set the distance in the field below; 0 makes a sharp corner. Works on drawn lines and on lines of the model.',
  'drafting.cmd.chamfer': 'CHAMFER',
  'drafting.prompt.chamferFirst': 'Select first line (distance {distance}) or type a distance:',
  'drafting.prompt.chamferSecond': 'Select second line:',
  'drafting.msg.chamferLinesOnly': 'Chamfer works on lines.',
  'drafting.msg.chamferFailed': 'Cannot chamfer these lines with that distance.',
} as const satisfies Record<string, TranslationValue>;
