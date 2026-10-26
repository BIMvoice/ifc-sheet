/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** `@bimvoice/ifcsheet/byggesaksbim`: the pure half of the ByggesaksBIM check, light enough for the app's bundle (the in-process run is in `/headless`). */

export { BYGGESAKSBIM_IDS } from './byggesaksbim-ids.js';
export { BYGGESAKSBIM_SPECS, byggesaksbimFindings } from './byggesaksbim.js';
export { syntheticByggesaksbimModel, type SyntheticOptions, type SyntheticPiece } from './synthetic-model.js';
