/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { GERMANY_LANDS, type GermanyLand } from '@bimvoice/ifcsheet';
import { optionalField } from './define';

declare module '../types' {
  interface ProjectFieldTypes {
    /**
     * The project is a German building application (Bauantrag): the drawer shows the checklist of its drawings
     * (`germany-set.ts` in the engine). Opt-in; absent: not a German permit project (#372).
     */
    germanyPermit?: true;
    /**
     * The Land the Bauantrag is filed in: the one choice that changes the drawings (the Lageplan scale, the Abstandsflächenplan sheet
     * of Baden-Württemberg). Absent: none chosen, which reads as any other Land (nothing is read for it).
     */
    germanyLand?: GermanyLand;
  }
}

/** Off is stored as absent, so a project that never chose saves exactly as before; anything but `true` loads as absent. */
export const germanyPermitField = optionalField('germanyPermit', (raw) => (raw.germanyPermit === true ? { germanyPermit: true as const } : {}));

/** A value that is not one of the four Länder choices loads as absent. */
export const germanyLandField = optionalField('germanyLand', (raw) => {
  const land = GERMANY_LANDS.find((l) => l === raw.germanyLand);
  return land ? { germanyLand: land } : {};
});
