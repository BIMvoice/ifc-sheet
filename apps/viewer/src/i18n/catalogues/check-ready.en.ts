/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';
export const checkReadyEn = {
  'ready.title': 'What the model lacks',
  'ready.none': 'The model has what the drawing set reads: storeys, rooms, materials, quantities.',
  'ready.noStoreys': 'The model has no building storeys.',
  'ready.noStoreys.effect': 'The set starts with no floor plans (one is made per storey) and sections get no level marks.',
  'ready.noSpaces': 'The model has no rooms (IfcSpace).',
  'ready.noSpaces.effect': 'TAGALL has no rooms to label, so room labels and the check for unlabelled rooms have nothing to work on.',
  'ready.noStorey': '{count} of {total} elements are on no storey.',
  'ready.noStorey.effect': 'The joinery schedule shows a dash in their Level column, and a label\'s Storey field stays empty.',
  'ready.noMaterials': '{count} of {total} elements have no material.',
  'ready.noMaterials.effect': 'The material takeoff leaves them out, and a label\'s Material field stays empty.',
  'ready.noQuantities': '{count} of {total} elements have no quantity set (Qto).',
  'ready.noQuantities.effect': 'The material takeoff has no volume or area for them.',
  'ready.duplicateGlobalIds': '{count} GlobalIds are shared by {entities} entities.',
  'ready.duplicateGlobalIds.effect': 'A tag or label finds its element by GlobalId, so it can point at the wrong one of those that share it.',
} as const satisfies Record<string, TranslationValue>;
