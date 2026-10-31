/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/**
 * What IfcSheet's face says to reach the door and window configurator (#656): "Opening and symbol" on the drawing's bar for a selected
 * door or window, and "Open to draw in" on the joinery schedule's card. Romanian: `joinery-reach.ro.ts`.
 */
export const joineryReachEn = {
  'joinery.reach.open': 'Opening and symbol',
  'joinery.reach.eyebrow': 'Door or window',
  'joinery.reach.title': 'Opening and symbol',
  'joinery.reach.close': 'Close',
  'joinery.reach.untyped': 'This element has no IFC type to keep an opening, leaves or a fanlight on, and the model is not changed. Choose its symbol above.',
  'joinery.reach.draw.title': 'Draw on a type',
  'joinery.reach.draw.type': 'Type',
  'joinery.reach.draw.view': 'View',
  'joinery.reach.draw.open': 'Open to draw in',
  'joinery.reach.draw.cutting': 'Cutting the views of the types…',
  'joinery.reach.draw.none': 'No type in this schedule has views to draw on yet. Select a door or window in a plan and give it its opening with "Opening and symbol".',
} satisfies Record<string, TranslationValue>;
