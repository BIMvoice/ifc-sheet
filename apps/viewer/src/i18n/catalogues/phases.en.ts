/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { TranslationValue } from '../types';
export const phasesEn = {
  'phase.existing': 'Existing',
  'phase.demolish': 'To demolish',
  'phase.new': 'Proposed',
  'phase.temporary': 'Temporary',
  'phase.title': 'Phases',
  'phase.hint': 'Draws each element by its phase, read from the IFC Status (NEW, EXISTING, DEMOLISH, TEMPORARY) or from the property mapped below. An element with no phase counts as the phase set under "No phase".',
  'phase.use': 'Draw by phase',
  'phase.preset': 'Start from',
  'phase.preset.survey': 'Survey',
  'phase.preset.demolition': 'Demolition plan',
  'phase.preset.proposed': 'Proposed plan',
  'phase.show': 'Show',
  'phase.lineColor': 'Lines',
  'phase.fillColor': 'Cut fill',
  'phase.lineWeight': 'Weight',
  'phase.dashed': 'Dashed',
  'phase.reset': 'Reset {phase}',
  'phase.sourceTitle': 'Where the phase is read from (whole project)',
  'phase.unmarked': 'No phase',
  'phase.mapSet': 'Property set',
  'phase.mapProperty': 'Property',
  'phase.mapValue': 'Value for {phase}',
  'phase.mapHint': 'Leave the set and property empty to read the IFC Status only. A mapped property wins where an element has a value for it.',
} as const satisfies Record<string, TranslationValue>;
