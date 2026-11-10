/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The per-view switch that draws a plan square to the building or to true north (`PlanProjectView.orientation`). */
export const planOrientationEn = {
  'planOrientation.label': 'Plan drawn',
  'planOrientation.building': 'Square to the building',
  'planOrientation.trueNorth': 'True north',
  'planOrientation.noModel': 'Open the model first: the plan turns with it.',
} as const satisfies Record<string, TranslationValue>;
