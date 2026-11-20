/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** Label presets (#828): the editor in the annotate panel, the LABELALL messages and the library kind. */
export const labelPresetsEn = {
  'labelPreset.title': 'Label presets',
  'labelPreset.hint': 'A preset labels only the elements that meet every condition of a group. Run one with LABELALL.',
  'labelPreset.name': 'Preset name',
  'labelPreset.group': 'Group {n}',
  'labelPreset.labelType': 'Label type',
  'labelPreset.condition': 'Condition',
  'labelPreset.by.class': 'IFC class',
  'labelPreset.by.type': 'IFC type',
  'labelPreset.by.material': 'Material',
  'labelPreset.by.classification': 'Classification code',
  'labelPreset.by.property': 'Property',
  'labelPreset.set': 'Property set',
  'labelPreset.property': 'Property',
  'labelPreset.value': 'Value',
  'labelPreset.addCondition': 'Add condition',
  'labelPreset.removeCondition': 'Remove condition',
  'labelPreset.addGroup': 'Add group',
  'labelPreset.removeGroup': 'Remove group',
  'labelPreset.save': 'Save preset',
  'labelPreset.delete': 'Delete preset {name}',
  'library.kind.labelPresets': 'Label presets',
  'drafting.msg.labelPresetDone': 'Preset {name}: {count} labels placed.',
  'drafting.msg.labelPresetNone': 'Preset {name}: no element left to label here.',
  'drafting.msg.labelPresetNoType': 'Preset {name} needs label types this project does not have: {types}.',
} as const satisfies Record<string, TranslationValue>;
