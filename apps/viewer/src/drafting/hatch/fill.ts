/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Hatch geometry generation is the engine's (`packages/ifcsheet/src/hatch-fill.ts`), so the PDF of `ifcsheet build` hatches as the app does (#479).
export { hatchSegments, type HatchOptions, type HatchResult, type HatchSegment } from '@bimvoice/ifcsheet';
