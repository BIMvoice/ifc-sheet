/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the keys the IfcSheet face reaches in `ids-panel` (#526). Term choices: `../ro-glossary.md`. */
export const idsPanelRo = {
  'idsPanel.error.modelNoData': 'Modelul selectat nu are date IFC analizate de validat',
  'idsPanel.error.modelNotLoaded': 'Modelul „{modelId}” nu este încărcat',
  'idsPanel.error.noModelLoaded': 'Niciun model IFC încărcat',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
