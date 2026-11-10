/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationKey } from '../en';
import type { TranslationValue } from '../types';

/** Romanian for the keys the IfcSheet face reaches in `split-tool` (#526). Term choices: `../ro-glossary.md`. */
export const splitToolRo = {
  'splitTool.unavailable.boolean': 'Nu se poate diviza: geometria este un solid tăiat boolean',
  'splitTool.unavailable.container': 'Nu se poate diviza: elementul stă direct în clădire sau în amplasament, nu pe un nivel. Mutați-l mai întâi pe un nivel',
  'splitTool.unavailable.kind': 'Nu se poate diviza: această metodă de divizare nu se aplică acestui element',
  'splitTool.unavailable.mapped': 'Nu se poate diviza: geometria este partajată cu tipul ei (reprezentare mapată)',
  'splitTool.unavailable.mesh': 'Nu se poate diviza: geometria este o plasă sau B-rep, nu o extrudare de profil',
  'splitTool.unavailable.noBody': 'Nu se poate diviza: elementul nu are geometrie de corp',
  'splitTool.unavailable.profile': 'Nu se poate diviza: profilul de extrudare nu este un dreptunghi',
  'splitTool.unavailable.shape': 'Nu se poate diviza: plasarea sau structura reprezentării nu este acceptată',
  'splitTool.unavailable.storey': 'Nu se poate diviza: elementul nu este conținut într-un nivel al clădirii',
  'splitTool.unavailable.type': 'Divizarea funcționează pe pereți, grinzi, stâlpi, bare, planșee, acoperișuri, plăci și spații',
} as const satisfies Partial<Record<TranslationKey, TranslationValue>>;
