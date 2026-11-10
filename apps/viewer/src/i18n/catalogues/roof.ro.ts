/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the keys the IfcSheet face reaches in `roof` (#526). Term choices: `../ro-glossary.md`. */
export const roofRo = {
  'roof.edge.eave': 'Streașină',
  'roof.edge.gable': 'Fronton',
  'roof.edge.kind': 'Muchie',
  'roof.edge.overhang': 'Debord (mm)',
  'roof.edge.pitch': 'Pantă (°)',
  'roof.edit.chip': 'Muchia {n}: {rule}',
  'roof.edit.done': 'Gata',
  'roof.edit.finish': 'Terminați',
  'roof.edit.hint': 'Faceți clic pe eticheta unei muchii pentru a o modifica; trageți mânerele conturului pentru a-l remodela.',
  'roof.edit.settings': 'Setările acoperișului',
  'roof.edit.title': 'Se editează {name}',
  'roof.problem': 'Nu se poate construi: {reason}',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
