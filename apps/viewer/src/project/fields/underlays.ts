/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { readUnderlays } from '@/underlay/underlay-file';
import type { ViewUnderlay } from '@/underlay/underlay';
import { optionalField } from './define';

declare module '../types' {
  interface ProjectFieldTypes {
    /** PDF pages and images laid under views to trace over (`underlay/underlay.ts`); absent: none. */
    underlays?: ViewUnderlay[];
  }
}

/** Written only when there is one: a project that never used an underlay saves as it did. */
export const underlaysField = optionalField('underlays', (raw) => {
  const underlays = readUnderlays(raw);
  return underlays.length > 0 ? { underlays } : {};
});
