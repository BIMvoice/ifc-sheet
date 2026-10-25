/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { defineField } from './define';

export const includeFarElementsField = defineField({ key: 'includeFarElements', empty: () => undefined, load: (v) => (v === true ? true : undefined), read: (raw) => (raw.includeFarElements === true ? { includeFarElements: true } : {}) });
