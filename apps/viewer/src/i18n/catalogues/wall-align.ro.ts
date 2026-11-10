/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for `wall-align.en.ts` (#168). */
export const wallAlignRo = {
  'wall.align.left': 'Aliniază marginile din stânga',
  'wall.align.right': 'Aliniază marginile din dreapta',
  'wall.align.top': 'Aliniază marginile de sus',
  'wall.align.bottom': 'Aliniază marginile de jos',
  'wall.align.centreH': 'Aliniază centrele pe orizontală',
  'wall.align.centreV': 'Aliniază centrele pe verticală',
  'wall.distribute.across': 'Distanțează egal pe orizontală',
  'wall.distribute.down': 'Distanțează egal pe verticală',
  'wall.align.group': 'Aliniați desenele alese',
  'wall.align.count': {
    one: 'Un desen ales',
    few: '{count} desene alese',
    other: '{count} de desene alese',
  },
  'wall.align.hint': 'Primul desen ales rămâne pe loc; celelalte se aliniază după el. Distanțarea lasă pe loc cele două desene din margini. Shift+clic adaugă sau scoate un desen.',
  'wall.align.needThree': 'Distanțarea egală cere trei desene.',
  'wall.align.anchor': 'Reper: {name}',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
