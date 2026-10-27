/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { PAC_MODES, type PacMode } from '@bimvoice/ifcsheet';
import { optionalField } from './define';

declare module '../types' {
  interface ProjectFieldTypes {
    /**
     * Which permit project the project makes: the full one (Anexa 2) or the simplified one for a rural house (Anexa 3). It selects the
     * checklist, the set and, for `rural`, the scope findings of the readiness list. Absent: the full one.
     */
    pacMode?: PacMode;
  }
}

/** Written only when the project chose; a value that is not one of the two loads as absent. */
export const pacModeField = optionalField('pacMode', (raw) => {
  const value = PAC_MODES.find((m) => m === raw.pacMode);
  return value ? { pacMode: value } : {};
});
