/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The parts of a split schedule on as few sheets as they fit (#186): next to each other, left to right from the left of the drawing
 * area and top-aligned, a fixed gap between two, each part as wide as its table needs. When the next part does not fit beside the ones
 * already there the sheet is closed and the part starts the next. A part that does not fit a sheet whole by itself (it pages) is never
 * put beside another: it takes sheets of its own, as a part hung alone does. Pure: it measures with the same layout the sheet draws
 * (`layoutSchedule`), so what is planned to fit is what prints.
 */

import { layoutSchedule, type ScheduleLabels } from '@/joinery/schedule-layout';
import type { ScheduleData } from '@/joinery/schedule-data';
import { bandFits } from './schedule-fit';
import type { Rect } from './sheet-frame';

/** The space between two parts on a sheet, paper mm (the gap between a joinery schedule's own bands). */
export const PART_GAP = 8;

export interface PartToPlace {
  id: string;
  /** The part's table; absent: it cannot be measured and is placed alone. */
  data?: ScheduleData;
  scale: number;
}

/** One sheet's parts, left to right with their widths; a single one is a part for a sheet of its own. */
export type SheetPlan = { id: string; width: number }[];

/** Measuring needs no text: only the number of rows and what a row's width is. */
const MEASURE: ScheduleLabels = { locale: 'en', title: '', mark: '', name: '', size: '', operation: '', sill: '', total: '', uValue: '', fire: '', op: () => '' };

/** The width `part` needs when it fits `area` on one page whole, else null. */
function widthWhole(part: PartToPlace, area: Rect): number | null {
  const { data, scale } = part;
  if (!data || data.entries.length === 0 || !bandFits(data, scale, area)) return null;
  const layout = layoutSchedule(data, MEASURE, { scale, maxWidth: area.w, maxHeight: area.h });
  return (layout.pages ?? 1) === 1 ? Math.ceil(layout.width) : null;
}

/** `parts` in order on sheets with the drawing area `area`: filled left to right, continued on the next sheet when a part does not fit beside the others. */
export function planSideBySide(parts: readonly PartToPlace[], area: Rect, gap = PART_GAP): SheetPlan[] {
  const sheets: SheetPlan[] = [];
  let open: SheetPlan = [];
  let used = 0;
  const close = () => { if (open.length) sheets.push(open); open = []; used = 0; };
  for (const part of parts) {
    const width = widthWhole(part, area);
    if (width === null) { close(); sheets.push([{ id: part.id, width: area.w }]); continue; }
    if (open.length && used + gap + width > area.w) close();
    used += (open.length ? gap : 0) + width;
    open.push({ id: part.id, width });
  }
  close();
  return sheets;
}
