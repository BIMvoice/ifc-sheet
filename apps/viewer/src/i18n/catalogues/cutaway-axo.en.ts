/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The cut-away axonometric (#97): adding one from "Add a drawing", and its storey cut in the drawing's card. */
export const cutawayAxoEn = {
  'cutawayAxo.add': 'Cut-away axonometric',
  'cutawayAxo.addHint': 'A storey seen from a corner, cut open',
  'cutawayAxo.storey': 'Storey',
  'cutawayAxo.cutHeight': 'Cut height above the floor, m',
  'cutawayAxo.create': 'Add the drawing',
  'cutawayAxo.viewName': '{storey}, cut-away axonometric',
  'cutawayAxo.card': 'Storey cut',
  'cutawayAxo.scaleNote': 'Drawn at its nominal scale: a vertical edge measures 1:{scale}.',
} as const satisfies Record<string, TranslationValue>;
