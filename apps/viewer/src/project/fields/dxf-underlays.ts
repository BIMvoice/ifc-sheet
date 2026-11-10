/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { readDxfUnderlays } from '@bimvoice/ifcsheet/underlay-read';
import { optionalField } from './define';

/** Written only when there is one: a project that never laid a DXF under a view saves as it did (#547). */
export const dxfUnderlaysField = optionalField('dxfUnderlays', (raw) => {
  const dxfUnderlays = readDxfUnderlays(raw);
  return dxfUnderlays.length > 0 ? { dxfUnderlays } : {};
});

/** Registered by this file (`./registered.ts`): found there, not listed. */
export const registeredFields = [dxfUnderlaysField] as const;
declare module './registered' {
  interface RegisteredFieldKeys {
    dxfUnderlays: true;
  }
}
