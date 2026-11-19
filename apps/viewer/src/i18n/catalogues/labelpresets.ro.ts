/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** Label presets (#828): the editor in the annotate panel, the LABELALL messages and the library kind. */
export const labelPresetsRo = {
  'labelPreset.title': 'Presetări de etichete',
  'labelPreset.hint': 'O presetare etichetează doar elementele care îndeplinesc toate condițiile unui grup. Rulați-o cu LABELALL.',
  'labelPreset.name': 'Numele presetării',
  'labelPreset.group': 'Grupul {n}',
  'labelPreset.labelType': 'Tip de etichetă',
  'labelPreset.condition': 'Condiție',
  'labelPreset.by.class': 'Clasa IFC',
  'labelPreset.by.type': 'Tipul IFC',
  'labelPreset.by.material': 'Material',
  'labelPreset.by.classification': 'Cod de clasificare',
  'labelPreset.by.property': 'Proprietate',
  'labelPreset.set': 'Set de proprietăți',
  'labelPreset.property': 'Proprietate',
  'labelPreset.value': 'Valoare',
  'labelPreset.addCondition': 'Adăugați condiție',
  'labelPreset.removeCondition': 'Eliminați condiția',
  'labelPreset.addGroup': 'Adăugați grup',
  'labelPreset.removeGroup': 'Eliminați grupul',
  'labelPreset.save': 'Salvați presetarea',
  'labelPreset.delete': 'Ștergeți presetarea {name}',
  'library.kind.labelPresets': 'Presetări de etichete',
  'drafting.msg.labelPresetDone': 'Presetarea {name}: {count} etichete puse.',
  'drafting.msg.labelPresetNone': 'Presetarea {name}: nu mai e niciun element de etichetat aici.',
  'drafting.msg.labelPresetNoType': 'Presetarea {name} cere tipuri de etichetă pe care proiectul nu le are: {types}.',
} as const satisfies Record<string, TranslationValue>;
