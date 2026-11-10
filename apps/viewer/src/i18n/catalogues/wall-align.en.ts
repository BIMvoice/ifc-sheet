/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** Lining chosen drawings up with each other on a sheet (#168). */
export const wallAlignEn = {
  'wall.align.left': 'Align left edges',
  'wall.align.right': 'Align right edges',
  'wall.align.top': 'Align top edges',
  'wall.align.bottom': 'Align bottom edges',
  'wall.align.centreH': 'Align horizontal centres',
  'wall.align.centreV': 'Align vertical centres',
  'wall.distribute.across': 'Space evenly across',
  'wall.distribute.down': 'Space evenly down',
  'wall.align.group': 'Line up the chosen drawings',
  'wall.align.count': {
    one: '{count} drawing chosen',
    other: '{count} drawings chosen',
  },
  'wall.align.hint': 'The first drawing you chose stays where it is; the others line up with it. Spacing keeps the outermost two where they are. Shift+click adds or removes a drawing.',
  'wall.align.needThree': 'Spacing evenly needs three drawings.',
  'wall.align.anchor': 'Anchor: {name}',
} as const satisfies Record<string, TranslationValue>;
