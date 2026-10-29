/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the keys the IfcSheet face reaches in `landxml` (#526). Term choices: `../ro-glossary.md`. */
export const landxmlRo = {
  'landXml.unitsPrompt.unit.USSurveyFoot': 'Picior topografic american',
  'landXml.unitsPrompt.unit.centimeter': 'Centimetru',
  'landXml.unitsPrompt.unit.foot': 'Picior',
  'landXml.unitsPrompt.unit.inch': 'Țol',
  'landXml.unitsPrompt.unit.kilometer': 'Kilometru',
  'landXml.unitsPrompt.unit.meter': 'Metru',
  'landXml.unitsPrompt.unit.mile': 'Milă',
  'landXml.unitsPrompt.unit.millimeter': 'Milimetru',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
