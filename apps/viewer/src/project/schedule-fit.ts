/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where a joinery schedule sits on the paper (#186). Its viewport is a box the
 * table wraps to: bands break at the box's width, and the bands that do not fit
 * its height continue on a continuation sheet (A-601.1…; `continuation-pages`),
 * so a schedule never runs off the paper and is never shrunk to fit: the
 * drawings keep the schedule's scale. A viewport with no box (0 × 0, from
 * before) takes the sheet's drawing area.
 */

import { ISO_PAPERS } from './paper';
import { withContinuationPages } from './continuation-pages';
import { sheetDrawingArea } from './viewport-resize';
import { useProjectStore } from './project-store';
import { registerHolders } from './drawing-register';
import { layoutSchedule, scheduleMinBox, schedulePages, type ScheduleLabels, type ScheduleLayout, type ScheduleLayoutOptions } from '@/joinery/schedule-layout';
import type { ElementViews } from '@/joinery/element-views';
import type { ScheduleData } from '@/joinery/schedule-data';
import type { Rect } from './sheet-frame';
import type { Paper, ProjectSchedule, ProjectSheet, SheetViewport } from './types';

/** The schedules whose table wraps to its viewport: the joinery lists. */
export function isJoinerySchedule(schedule: Pick<ProjectSchedule, 'kind'> | undefined): boolean {
  return schedule?.kind === 'door' || schedule?.kind === 'window' || schedule?.kind === 'all';
}

/** The box `vp` gives its table, paper mm: its own, or the size of the sheet's drawing area (centred on the viewport) while it has none. */
export function scheduleBox(sheet: ProjectSheet, vp: Pick<SheetViewport, 'x' | 'y' | 'width' | 'height'>): Rect {
  if (vp.width > 0 && vp.height > 0) return { x: vp.x - vp.width / 2, y: vp.y - vp.height / 2, w: vp.width, h: vp.height };
  const area = sheetDrawingArea(sheet);
  return { x: vp.x - area.w / 2, y: vp.y - area.h / 2, w: area.w, h: area.h };
}

/**
 * The box every page of the schedule `scheduleId` is wrapped to: its first
 * sheet's viewport's, never that of the sheet drawing a page, so a page can
 * neither repeat nor skip a band when the sheets differ (like `registerPaper`).
 */
export function scheduleHomeBox(sheets: readonly ProjectSheet[], scheduleId: string, fallback: ProjectSheet, vp: SheetViewport): Rect {
  const home = registerHolders(sheets, scheduleId)[0];
  const homeVp = home?.viewports?.find((v) => v.viewId === scheduleId);
  return home && homeVp ? scheduleBox(home, homeVp) : scheduleBox(fallback, vp);
}

/** The layout options that wrap a table into `box` at `scale`. */
export function boxOptions(box: Rect, scale: number): Pick<ScheduleLayoutOptions, 'scale' | 'maxWidth' | 'maxHeight'> {
  return { scale, maxWidth: box.w, maxHeight: box.h };
}

/** Whether one band of `data` at `scale` fits `box` whole. */
export function bandFits(data: ScheduleData, scale: number, box: Rect): boolean {
  const min = scheduleMinBox(data, { scale });
  return min.width <= box.w && min.height <= box.h;
}

/** `paper` if one band of `data` fits its drawing area at `scale`, else the next larger ISO paper that holds it (the largest when none does). */
export function paperHolding(sheet: ProjectSheet, data: ScheduleData, scale: number): Paper | undefined {
  const base = sheet.paper;
  if (typeof base !== 'string') return base;
  for (let i = ISO_PAPERS.indexOf(base); i >= 0; i--) {
    if (bandFits(data, scale, sheetDrawingArea({ ...sheet, paper: ISO_PAPERS[i] }))) return ISO_PAPERS[i];
  }
  return ISO_PAPERS[0];
}

/**
 * Put the schedule `scheduleId` over `pages` sheets, continuation sheets added or removed after its own, and
 * each continuation sheet's viewport on the first one's box and scale. One write, and none when nothing changes.
 */
export function syncSchedulePages(scheduleId: string, pages: number): void {
  const { sheets } = useProjectStore.getState();
  const counted = withContinuationPages(sheets, scheduleId, pages) ?? sheets;
  const home = registerHolders(counted, scheduleId)[0]?.viewports?.find((v) => v.viewId === scheduleId);
  const same = (v: SheetViewport) => !home || (v.x === home.x && v.y === home.y && v.width === home.width && v.height === home.height && v.scale === home.scale);
  const followed = home
    ? counted.map((s) => (!(s.viewports ?? []).some((v) => v.viewId === scheduleId && (v.page ?? 0) > 0 && !same(v))
      ? s
      : { ...s, viewports: (s.viewports ?? []).map((v) => ((v.page ?? 0) > 0 && v.viewId === scheduleId ? { ...v, x: home.x, y: home.y, width: home.width, height: home.height, scale: home.scale } : v)) }))
    : counted;
  if (followed.some((s, i) => s !== sheets[i]) || followed.length !== sheets.length) useProjectStore.setState({ sheets: followed, dirty: true });
}

/** How many sheets `data` takes in `box` at `scale`. */
export function pagesIn(data: ScheduleData, scale: number, box: Rect): number {
  return schedulePages(data, boxOptions(box, scale));
}

/**
 * The page of the schedule that viewport `vp` of `sheet` shows: wrapped to the box of the schedule's first sheet (so every page
 * agrees on where the bands break), drawn into `vp`'s own box, with the smallest box a resize may shrink it to.
 */
export function layoutJoineryOnSheet(
  input: { data: ScheduleData; labels: ScheduleLabels; scale: number; views?: ReadonlyMap<string, ElementViews>; sheets: readonly ProjectSheet[]; sheet: ProjectSheet; vp: SheetViewport },
): ScheduleLayout {
  const { data, labels, scale, views, sheets, sheet, vp } = input;
  const wrap = scheduleHomeBox(sheets, vp.viewId, sheet, vp);
  const layout = layoutSchedule(data, labels, { ...boxOptions(wrap, scale), views, page: vp.page ?? 0 });
  return { ...layout, fit: { box: scheduleBox(sheet, vp), min: scheduleMinBox(data, { scale, views }) } };
}
