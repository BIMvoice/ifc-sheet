/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Moved to the engine package (`packages/ifcsheet/src/text-width.ts`) so the title block fits its text the same way in the app and in the PDF; re-exported here so the app's imports stay as they were. */

export { textWidthEm, truncateToWidth } from '@bimvoice/ifcsheet';
