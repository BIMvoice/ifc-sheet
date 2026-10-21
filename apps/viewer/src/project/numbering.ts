/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Moved to the engine package (`packages/ifcsheet/src/numbering.ts`); re-exported here so the app's imports stay as they were. */

export { DEFAULT_SCHEME, NUMBER_GROUPS, SCHEME_PRESETS, SEQUENTIAL_SCHEME, formatNumber, nextNumber, numberAt, numberGroupOf, numberSheets, planRenumber, readNumberingScheme, registerNumberIn, registerSlot, renumbered, typedBeforeSchemes } from '@bimvoice/ifcsheet';
export type { OverrideMode, RenumberRow } from '@bimvoice/ifcsheet';
