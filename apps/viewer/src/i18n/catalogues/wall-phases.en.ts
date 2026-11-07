/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The Phases section of the viewport card (#652): the heading and its closed summary; the controls are `phases.en.ts`. */
export const wallPhasesEn = {
  'wall.phases.title': 'Phases',
  'wall.phases.summaryOff': 'Not drawn by phase',
  'wall.phases.summaryOn': 'Drawn by phase',
} as const satisfies Record<string, TranslationValue>;
