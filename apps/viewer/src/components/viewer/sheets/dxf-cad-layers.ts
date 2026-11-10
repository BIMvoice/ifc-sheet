/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// the CAD layer resolution at DXF write time is the engine's (`packages/ifcsheet/src/dxf.ts`), so `ifcsheet build --dxf` writes what the app does (#619).
export * from '@bimvoice/ifcsheet/dxf';
