/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the keys the IfcSheet face reaches in `visibility-reasons` (#526). Term choices: `../ro-glossary.md`. */
export const visibilityReasonsRo = {
  'visibilityReasons.classFilter': 'Filtru de clase',
  'visibilityReasons.exploded': 'Niveluri desfăcute',
  'visibilityReasons.ghost': 'Context transparent (raze X)',
  'visibilityReasons.hidden': 'Elemente ascunse',
  'visibilityReasons.hostTypes': 'Clase ascunse prin gazdă',
  'visibilityReasons.isolation': 'Elemente izolate',
  'visibilityReasons.lens': 'Lentilă activă',
  'visibilityReasons.measurements': 'Măsurători',
  'visibilityReasons.modelHidden': 'Modele ascunse',
  'visibilityReasons.section': 'Plan de secționare',
  'visibilityReasons.storey': 'Filtru de nivel sau vedere Solo',
  'visibilityReasons.typeViewMode': 'Vedere pe tipuri',
  'visibilityReasons.typeVisibility': 'Clase IFC ascunse',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
