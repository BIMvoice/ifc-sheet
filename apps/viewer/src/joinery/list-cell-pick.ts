/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The cell of a list schedule picked on the sheet (#446): which schedule, which element (GlobalId) and which column (id). The sheet sets
 * it on a click, the viewport card reads it to offer the override. Held by element and column, not by place in the table, so a model
 * reloaded under the pick leaves it on the same cell.
 */

import { create } from 'zustand';
import type { ScheduleCell, ScheduleLayout } from './schedule-layout';

export interface CellPick {
  scheduleId: string;
  guid: string;
  column: string;
}

export const useCellPick = create<{ pick: CellPick | null }>()(() => ({ pick: null }));

export const pickCell = (pick: CellPick | null): void => useCellPick.setState({ pick });

/** The pickable cell of `layout` at the paper point `p`, for a schedule drawn at the top left of its box (`layout.fit`); null where none is. */
export function cellAt(layout: ScheduleLayout | undefined, p: { x: number; y: number }): ScheduleCell | null {
  const box = layout?.fit?.box;
  if (!layout?.cells || !box) return null;
  const x = p.x - box.x, y = p.y - box.y;
  return layout.cells.find((c) => x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) ?? null;
}
