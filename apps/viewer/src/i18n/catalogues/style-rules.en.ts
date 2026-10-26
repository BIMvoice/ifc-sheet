/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The class and material mapping of a view template, in the view template list (#31). */
export const styleRulesEn = {
  'wall.rules.title': 'Mapping by class and material',
  'wall.rules.hint': 'Draw an IFC class or a building material its own way in every drawing that follows this template. A class rule sets the line and the fill; a material rule the fill and hatch of its cut. A drawing\'s own graphics still win. Name several with ;.',
  'wall.rules.empty': 'Nothing mapped yet.',
  'wall.rules.class': 'IFC class',
  'wall.rules.material': 'Material',
  'wall.rules.swatch': 'How {name} draws',
  'wall.rules.matches': '{kind} names, separated by ;',
  'wall.rules.weight': 'Cut weight of {name}',
  'wall.rules.fill': 'Fill of {name}',
  'wall.rules.fillClear': 'No fill for {name}',
  'wall.rules.line': 'Line colour of {name}',
  'wall.rules.lineClear': 'No line colour for {name}',
  'wall.rules.hatch': 'Hatch of {name}',
  'wall.rules.hatchNone': 'No hatch',
  'wall.rules.remove': 'Remove the rule for {name}',
  'wall.rules.addKind': 'Kind of rule',
  'wall.rules.addName': 'Class or material to map',
  'wall.rules.add': 'Add rule',
  'wall.rules.unmapped': 'In the model, not mapped',
  'wall.rules.allMapped': 'Everything in the loaded models is mapped.',
  'wall.rules.noModel': 'Load a model to list its classes and materials.',
  'wall.rules.mapIt': 'Map the {kind} {name}',
} as const satisfies Record<string, TranslationValue>;
