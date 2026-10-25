/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The key presets in the keyboard settings (#166). */
export const wallKeyPresetsEn = {
  'wall.keys.preset.label': 'Key set',
  'wall.keys.preset.default': 'IfcSheet default',
  'wall.keys.preset.defaultHint': 'The keys IfcSheet ships with.',
  'wall.keys.preset.autocad': 'AutoCAD-like',
  'wall.keys.preset.autocadHint': 'Keys an AutoCAD user expects: Ctrl+Y redoes, only Delete erases (Backspace edits the command line), Ctrl+PageUp and Ctrl+PageDown change sheet. The other keys are the same as the default set.',
  'wall.keys.preset.switched': 'Key set: {preset}.',
  'wall.keys.preset.switchedDropped': { one: 'Key set: {preset}. {count} of your own keys was removed because the set uses it for another action.', other: 'Key set: {preset}. {count} of your own keys were removed because the set uses them for other actions.' },
  'wall.keys.preset.custom': { one: 'Your own changes: {count} action on a key of your choice, on top of {preset}.', other: 'Your own changes: {count} actions on keys of your choice, on top of {preset}.' },
  'wall.keys.preset.noCustom': 'No changes of your own: every action is on a key of {preset}.',
  'wall.keys.preset.offerAutocad': 'These keys go with AutoCAD mode (typed command names, Enter to repeat). It is off. Turn it on too?',
  'wall.keys.preset.offerAutocadOn': 'Turn on AutoCAD mode',
  'wall.keys.preset.offerLater': 'Not now',
} as const satisfies Record<string, TranslationValue>;
