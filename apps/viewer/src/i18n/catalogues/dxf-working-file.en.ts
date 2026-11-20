/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The sheet DXF's options (#831): layers by pen or by element, units of the paper or of the model. */
export const dxfWorkingFileEn = {
  'dxfWorkingFile.layers': 'DXF layers',
  'dxfWorkingFile.layers.pen': 'By pen',
  'dxfWorkingFile.layers.element': 'By element',
  'dxfWorkingFile.units': 'DXF units',
  'dxfWorkingFile.units.paper': 'Paper (mm)',
  'dxfWorkingFile.units.model': 'Model 1:1 (m)',
} as const satisfies Record<string, TranslationValue>;
