/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { TranslationValue } from '../types';

/** The project drawer's "Units and numbers" section (#88). */
export const unitsNumbersEn = {
  'wall.units.title': 'Units and numbers',
  'wall.units.intro': 'How every figure on the sheets is written: dimensions, level marks, labels, schedules and the urban indicators.',
  'wall.units.lengthUnit': 'Length unit for dimensions',
  'wall.units.lengthUnit.style': 'As the dimension style says',
  'wall.units.lengthUnit.mm': 'Millimetres (mm)',
  'wall.units.lengthUnit.cm': 'Centimetres (cm)',
  'wall.units.lengthUnit.m': 'Metres (m)',
  'wall.units.separator': 'Decimal separator',
  'wall.units.separator.language': 'Follow the language',
  'wall.units.separator.comma': 'Comma (1.234,50)',
  'wall.units.separator.point': 'Point (1,234.50)',
  'wall.units.decimals': 'Decimals',
  'wall.units.decimals.default': 'As now',
  'wall.units.decimals.length': 'Length',
  'wall.units.decimals.area': 'Area',
  'wall.units.decimals.volume': 'Volume',
  'wall.units.decimals.level': 'Level mark',
  'wall.units.group': 'Group thousands in areas and quantities',
  'wall.units.fixed': 'Areas are in m² and volumes in m³.',
  'wall.units.example': 'Example: {length} dimension, {area} area, {level} level mark',
  'wall.units.exports': 'CSV files keep plain numbers with a point, so a spreadsheet can add them up; with a comma separator they use ";" between columns. Excel files keep numbers and take the decimals chosen here.',
  'wall.units.reset': 'Back to the defaults',
} as const satisfies Record<string, TranslationValue>;
