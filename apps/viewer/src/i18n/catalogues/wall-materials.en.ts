/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { TranslationValue } from '../types';

/** The Materials section of the project drawer (#90). The rest of its words are `materials.en.ts`. */
export const wallMaterialsEn = {
  'wall.materials.summary': { one: '{count} material, {changed} changed', other: '{count} materials, {changed} changed' },
  'wall.materials.none': 'No materials in the loaded models yet. Open a model whose walls and slabs have material layers.',
  'wall.materials.swatchOf': 'How {name} draws on a sheet at 1:100',
  'wall.materials.resetOf': 'Reset {name} to the defaults its name suggests',
  'wall.materials.resetAll': 'Reset all to the defaults',
  'wall.materials.edited': '(edited)',
} as const satisfies Record<string, TranslationValue>;
