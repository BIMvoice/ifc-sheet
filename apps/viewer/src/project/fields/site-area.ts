/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { optionalField } from './define';

declare module '../types' {
  interface ProjectFieldTypes {
    /** The site (plot) area in m² the user entered; absent: the model's IfcSite area, if it states one (`urban/`). */
    siteArea?: number;
  }
}

export const siteAreaField = optionalField('siteArea', (raw) => (typeof raw.siteArea === 'number' && Number.isFinite(raw.siteArea) && raw.siteArea > 0 ? { siteArea: raw.siteArea } : {}));
