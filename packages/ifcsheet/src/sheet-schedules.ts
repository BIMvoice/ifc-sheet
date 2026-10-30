/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A schedule placed on a sheet, as the engine's sheet prints it (#479). A schedule built from the Lists engine is laid out by the
 * app's own code: its table is `listScheduleTable` (the run `ifcsheet list` makes), set on paper by `layoutListSchedule`, paged and
 * placed in its viewport's box by `layoutTableOnSheet`. The primitives are then drawn where the app's `ScheduleViewport` draws them:
 * at the box's top left, clipped to it. The rooms schedule, the finishes schedule, the bill of quantities and the drawing register are laid
 * out by the app's own code too (`SchedulePager`, made in `project-sheets.ts`). The other kinds of schedule (doors and windows,
 * materials, types, urban indicators) are not printed yet and are reported.
 */

import type { Point2D } from '@ifc-lite/drawing-2d';
import type { ProjectSheet, SheetViewport } from './document.js';
import { clipPolyline, pointInBox } from './clip.js';
import { layoutListSchedule } from './list-schedule-layout.js';
import type { ListScheduleTable } from './list-schedule.js';
import { layoutTableOnSheet } from './schedule-place.js';
import type { ScheduleLayout } from './schedule-prim.js';
import type { SheetStroke } from './sheet-annotations.js';
import type { Rect } from './sheet-frame.js';
import type { SheetText } from './sheet-graphic.js';
import type { SheetLocale } from './units-and-numbers.js';

/** A list schedule's table, run over the model, with the name its title prints. */
export interface PlacedTable {
  name: string;
  table: ListScheduleTable;
}

/** Where a schedule is placed: the sheets, the sheet whose viewport shows it and the viewport; and the word a page after the first says in its title. */
export interface SchedulePlace {
  continued?: string;
  sheets: readonly ProjectSheet[];
  sheet: ProjectSheet;
  vp: SheetViewport;
}

/** A schedule that lays itself out where it is placed: its table, set on paper by the app's layout and put in the box of its viewport (`layoutTableOnSheet`, or the register's own fit). */
export type SchedulePager = (place: SchedulePlace) => ScheduleLayout;

/** What the sheets' schedules are drawn with: each list schedule's table by schedule id, the other kinds' pagers by schedule id, and the language of their figures. */
export interface SheetSchedules {
  tables: ReadonlyMap<string, PlacedTable>;
  /** The rooms schedule, the finishes schedule, the bill of quantities and the register, by schedule id. */
  pages?: ReadonlyMap<string, SchedulePager>;
  locale: SheetLocale;
  /** The word a page after the first says in its title ("continued"); absent: the page counter alone. */
  continued?: string;
  /** The project's "Tables" text style (`tablesFace`) when it has made one; absent: the sheet's Inter. */
  face?: { font: 'sans' | 'serif' | 'mono'; italic: boolean };
}

/** The word for "continued" in a schedule's title, by language (the app's `schedule.continued`). */
export const SCHEDULE_CONTINUED: Readonly<Record<string, string>> = { en: 'continued', ro: 'continuare' };

/** The page of the schedule `vp` shows, laid out and placed as the app's sheet does; null when `vp` shows no schedule of `schedules`. */
export function placedListSchedule(sheet: ProjectSheet, sheets: readonly ProjectSheet[], vp: SheetViewport, schedules: SheetSchedules): ScheduleLayout | null {
  const pager = schedules.pages?.get(vp.viewId);
  if (pager) return pager({ continued: schedules.continued, sheets, sheet, vp });
  const placed = schedules.tables.get(vp.viewId);
  if (!placed) return null;
  return layoutTableOnSheet({ continued: schedules.continued, sheets, sheet, vp }, (paging) => layoutListSchedule(placed.table, { locale: schedules.locale, title: placed.name }, paging));
}

/** A schedule's primitives on the paper: drawn at its box's top left (`layout.fit`), else centred on the viewport point, and clipped to that box. */
export function scheduleGraphics(layout: ScheduleLayout, vp: Pick<SheetViewport, 'x' | 'y'>, face?: SheetSchedules['face']): { strokes: SheetStroke[]; texts: SheetText[]; box: Rect } {
  const box = layout.fit?.box ?? { x: vp.x - layout.width / 2, y: vp.y - layout.height / 2, w: layout.width, h: layout.height };
  const at = (x: number, y: number): Point2D => ({ x: box.x + x, y: box.y + y });
  const clip = (pts: Point2D[]) => (layout.fit ? clipPolyline(pts, box) : [pts]);
  const strokes: SheetStroke[] = [];
  const texts: SheetText[] = [];
  for (const p of layout.prims) {
    if (p.kind === 'line') strokes.push({ colour: '#000000', width: p.w, runs: clip([at(p.x1, p.y1), at(p.x2, p.y2)]) });
    else if (p.kind === 'path') {
      const pts = p.pts.map((q) => at(q.x, q.y));
      strokes.push({ colour: '#000000', width: p.w, ...(p.dashed ? { dash: [1.2, 0.8] } : {}), runs: clip(p.closed ? [...pts, pts[0]] : pts) });
    } else {
      const where = at(p.x, p.y);
      // A text whose anchor the clip cuts away is not on the sheet.
      if (layout.fit && !pointInBox(where, box)) continue;
      texts.push({ at: where, text: p.text, size: p.size, align: p.anchor === 'middle' ? 'center' : p.anchor === 'end' ? 'right' : 'left', ...(p.rotate ? { angle: -p.rotate } : {}), ...(p.bold ? { bold: true as const } : {}), ...(face ? { face } : {}) });
    }
  }
  return { strokes, texts, box };
}
