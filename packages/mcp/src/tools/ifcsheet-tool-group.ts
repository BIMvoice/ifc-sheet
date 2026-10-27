/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A file's `ifcsheet_*` tools, registered from the file itself (#144). A new tool file exports one `toolGroup` and
 * adds one import line to `ifcsheet-tools.ts`; it no longer edits a shared array. `order` is the position of the
 * group in the server's tool list, so the list a client sees does not depend on import order.
 */

import type { Tool } from './types.js';

export interface ToolGroup {
  /** Position of the group in the tool list; unique across groups (`ifcsheet-tools.ts` refuses a duplicate). Leave gaps of 10. */
  order: number;
  tools: readonly Tool[];
}
