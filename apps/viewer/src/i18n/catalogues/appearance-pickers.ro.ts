/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the keys the IfcSheet face reaches in `appearance-pickers` (#526). Term choices: `../ro-glossary.md`. */
export const appearancePickersRo = {
  'appearance.facePicker.error.ambiguous': 'Această față randată nu are o identitate sursă exactă. Reîncărcați modelul și încercați din nou.',
  'appearance.facePicker.error.busy': 'Așteptați să se termine previzualizarea curentă a aspectului.',
  'appearance.facePicker.error.differentSurface': 'Alegeți o față a obiectului deschis în editorul de fețe.',
  'appearance.facePicker.error.miss': 'Nicio suprafață vizibilă sub cursor.',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
