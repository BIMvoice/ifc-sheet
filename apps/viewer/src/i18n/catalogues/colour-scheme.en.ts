/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** A view coloured by a property, and the legend of its colours (#92). */
export const colourSchemeEn = {
  'legend.category.colours': 'Colours by value',
  'wall.scheme.title': 'Colour by property',
  'wall.scheme.summaryOff': 'Not coloured',
  'wall.scheme.summary': 'By {property}',
  'wall.scheme.start': 'Colour this view by a property',
  'wall.scheme.target': 'Colour',
  'wall.scheme.target.rooms': 'Rooms',
  'wall.scheme.target.elements': 'Elements',
  'wall.scheme.classes': 'Elements of',
  'wall.scheme.classesAll': 'All classes',
  'wall.scheme.property': 'Property',
  'wall.scheme.propertyPick': 'Choose a property',
  'wall.scheme.propertyType': 'Or write Pset.Property, or an attribute such as LongName',
  'wall.scheme.palette': 'Palette',
  'wall.scheme.palette.tol-light': 'Soft, colour-blind safe',
  'wall.scheme.palette.okabe-ito': 'Strong, colour-blind safe',
  'wall.scheme.values': 'Values in this view',
  'wall.scheme.valueCount': { one: '{count} value', other: '{count} values' },
  'wall.scheme.colourOf': 'Colour of {value}',
  'wall.scheme.reset': 'Automatic colour',
  'wall.scheme.noValues': 'No room or element of this view has a value for this property.',
  'wall.scheme.unreadable': 'This property cannot be read. Write Pset.Property, or an attribute such as LongName.',
  'wall.scheme.addLegend': 'Add legend',
  'wall.scheme.legendOnSheet': 'The legend is on this sheet',
  'wall.scheme.remove': 'Stop colouring',
} as const satisfies Record<string, TranslationValue>;
