/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Every `ifcsheet_*` tool, assembled from the groups the tool files register (#144). Add a tool file: export a
 * `toolGroup` from it and add its import below (one line, sorted by file name). The order of the list is each
 * group's `order`, not the order of these imports.
 */

import type { Tool } from './types.js';
import type { ToolGroup } from './ifcsheet-tool-group.js';
import { toolGroup as core } from './ifcsheet.js';
import { toolGroup as edit } from './ifcsheet-edit.js';
import { toolGroup as files } from './ifcsheet-files.js';
import { toolGroup as schedule } from './ifcsheet-schedule.js';
import { toolGroup as takeoff } from './ifcsheet-takeoff.js';
import { toolGroup as undo } from './ifcsheet-undo.js';

const GROUPS: readonly ToolGroup[] = [core, edit, files, schedule, takeoff, undo];

/** The tools of `groups` in group order; two groups with one `order` would make the list depend on import order, so that throws. */
export function assembleTools(groups: readonly ToolGroup[]): Tool[] {
  const seen = new Set<number>();
  for (const g of groups) {
    if (seen.has(g.order)) throw new Error(`Two ifcsheet tool groups share order ${g.order}.`);
    seen.add(g.order);
  }
  return [...groups].sort((a, b) => a.order - b.order).flatMap((g) => g.tools);
}

export const ifcsheetTools: Tool[] = assembleTools(GROUPS);
