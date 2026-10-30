/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** What the type form says about the head of a door or window type and the properties typed in for it (#448). Romanian: `joinery-head.ro.ts`. */
export const joineryHeadEn = {
  'joinery.head.title': 'Head',
  'joinery.head.square': 'Square',
  'joinery.head.round': 'Round',
  'joinery.head.segmental': 'Segmental',
  'joinery.head.pointed': 'Pointed',
  'joinery.head.rise': 'Rise of the arch (mm)',
  'joinery.head.riseDefault': 'Rise (mm), blank for the default',
  'joinery.type.sill': 'Sill height of the type (mm)',
  'joinery.type.sillDefault': 'Sill (mm), blank for none stated',
  'joinery.props.title': 'Properties added by hand',
  'joinery.props.hint': 'Kept in the project, not written to the IFC. A schedule lists one as a row: "Add a column" on its card, set "Typed for the type".',
  'joinery.props.name': 'Name',
  'joinery.props.value': 'Value',
  'joinery.props.add': 'Add a property',
  'joinery.props.remove': 'Remove {name}',
} satisfies Record<string, TranslationValue>;
