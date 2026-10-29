/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { optionalField } from './define';

declare module '../types' {
  interface ProjectFieldTypes {
    /** The project opts in to the ByggesaksBIM (Norway) readiness check (#372); off is absent, so a project that never touched it saves exactly as before. */
    byggesaksbim?: true;
  }
}

export const byggesaksbimField = optionalField('byggesaksbim', (raw) => (raw.byggesaksbim === true ? { byggesaksbim: true } : {}));
