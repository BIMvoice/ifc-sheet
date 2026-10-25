/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The visible ways out of a tool, a command and a chosen drawing, so Esc is never the only one (#166). */
export const wallExitsEn = {
  'wall.tool.done': 'Done',
  'wall.vp.done': 'Done',
  'drafting.done': 'Done',
} as const satisfies Record<string, TranslationValue>;
