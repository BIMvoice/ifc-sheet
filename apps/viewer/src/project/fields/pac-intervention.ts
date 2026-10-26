/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { PAC_INTERVENTIONS, type PacIntervention } from '@bimvoice/ifcsheet';
import { optionalField } from './define';

declare module '../types' {
  interface ProjectFieldTypes {
    /**
     * The works the permit project (PAC, Legea 169/2026 Anexa 2) is for: a new building, an intervention on an existing building,
     * or an interior-only intervention. Decides which Anexa 2 items apply (`pac-set.ts` in the engine). Absent: a new building.
     */
    pacIntervention?: PacIntervention;
  }
}

/** A new building is stored as absent, so a project that never chose saves exactly as before; a value that is not one of the three loads as absent. */
export const pacInterventionField = optionalField('pacIntervention', (raw) => {
  const value = PAC_INTERVENTIONS.find((i) => i === raw.pacIntervention);
  return value && value !== 'new' ? { pacIntervention: value } : {};
});
