/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** What the type form says about a DXF block used as the plan symbol of a door or window type (#448). Romanian: `joinery-block.ro.ts`. */
export const joineryBlockEn = {
  'joinery.block.title': 'Plan symbol from a DXF block',
  'joinery.block.hint': 'Drawn in plan in place of the generated symbol, fitted to the opening width, as a left-hand opening with the exterior towards +Y; a right-hand type mirrors it. Kept in the project.',
  'joinery.block.file': 'DXF file',
  'joinery.block.pick': 'Block',
  'joinery.block.current': 'Symbol: {name}',
  'joinery.block.remove': 'Remove the plan symbol',
  'joinery.block.none': 'The file has no block with lines, arcs or circles.',
  'joinery.block.empty': 'The block has nothing that can be drawn.',
  'joinery.block.millimetres': 'The file states no units: read as millimetres.',
  'joinery.block.unsupported': 'Not drawn: {list}.',
  'joinery.block.skipped': 'Skipped elsewhere in the file: {list}.',
  'joinery.block.truncated': 'The block is larger than a symbol keeps; part of it is left out.',
} satisfies Record<string, TranslationValue>;
