/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A schedule laid out on paper (millimetres from its top-left corner, y down) as the primitives every writer draws: the app's
 * sheet (`ScheduleGraphic.tsx`), its DXF, and the engine's sheet (`sheet-schedules.ts`) that the PDF of `ifcsheet build` prints.
 */

export type SchedulePrim =
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; w: number }
  | { kind: 'path'; pts: { x: number; y: number }[]; closed?: boolean; w: number; dashed?: boolean; view?: 'front' | 'plan' | 'section' | 'symbol' }
  | { kind: 'text'; x: number; y: number; text: string; size: number; anchor: 'start' | 'middle' | 'end'; bold?: boolean; rotate?: number };

/** A cell of a column table that can be picked on the sheet (#446): its box in the layout's millimetres, the element (GlobalId) and the column (id) it is. */
export interface ScheduleCell { x: number; y: number; w: number; h: number; guid: string; column: string; /** The cell holds a value typed over the model's: the editor marks it, the print does not. */ overridden?: true }

export interface ScheduleLayout {
  width: number;
  height: number;
  prims: SchedulePrim[];
  /** How many pages the table runs over (a schedule given a `maxHeight` it does not fit continues on further sheets); absent: one. */
  pages?: number;
  /** The cells of this page a person can pick (a list schedule's element rows), by the table's row and column. */
  cells?: ScheduleCell[];
  /** A column table's smallest page box (its width; title, header and one row): the box a resize stops at. A joinery schedule has `scheduleMinBox`. */
  minBox?: { width: number; height: number };
  /**
   * Set when the table is wrapped to a viewport's box (joinery schedules on a sheet): the box, paper mm, it is drawn at the top
   * left of and clipped to, and the smallest box that holds one band whole (a resize stops there).
   */
  fit?: { box: { x: number; y: number; w: number; h: number }; min: { width: number; height: number } };
}
