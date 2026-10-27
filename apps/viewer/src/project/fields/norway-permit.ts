/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { optionalField } from './define';

declare module '../types' {
  interface ProjectFieldTypes {
    /**
     * The project is a Norwegian building application (byggesak, SAK10 § 5-4): the drawer shows the checklist of its
     * drawings (`norway-set.ts` in the engine). Opt-in; absent: not a Norwegian permit project (#372).
     */
    norwayPermit?: true;
  }
}

/** Off is stored as absent, so a project that never chose saves exactly as before; anything but `true` loads as absent. */
export const norwayPermitField = optionalField('norwayPermit', (raw) => (raw.norwayPermit === true ? { norwayPermit: true as const } : {}));
