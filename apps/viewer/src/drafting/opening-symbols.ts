/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Plan symbols for doors and windows. Lives in the engine (`@bimvoice/ifcsheet`, `opening-symbols.ts`), one copy for the app and the engine; re-exported for the app's imports. */

export {
  DOUBLE_LEAF_WIDTH, doorSymbol, hullCandidates, minAreaRect, openingSymbols, symbolShapes, windowSymbol,
  type OpeningRect, type OpeningSymbol,
} from '@bimvoice/ifcsheet';
