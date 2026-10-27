/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// The hatch pattern format is the engine's (`packages/ifcsheet/src/hatch-pattern.ts`), so the PDF of `ifcsheet build` hatches as the app does (#479).
export { parsePat, serializePat, type HatchLineFamily, type HatchPattern } from '@bimvoice/ifcsheet';
