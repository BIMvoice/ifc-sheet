/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The intro's two shortcuts to a finished set: annotate it, and issue it as PDF. */
export const wallIntroActionsEn = {
  'wall.introActions.annotate': 'Annotate the set: tags, dimensions, levels',
  'wall.introActions.annotated': { one: '{count} annotation added on {views} of the drawings.', other: '{count} annotations added on {views} of the drawings.' },
  'wall.introActions.nothing': 'Nothing to add: the drawings are already annotated, or have nothing to tag or dimension.',
} as const satisfies Record<string, TranslationValue>;
