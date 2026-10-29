/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where a schedule sits on the paper (#186). Its viewport is a box the table
 * fits: a joinery schedule's bands break at the box's width, a column table's
 * (takeoff, finishes, types, urban) rows at its height, and what does not fit
 * the height continues on a continuation sheet (A-601.1…; `continuation-pages`),
 * so a schedule never runs off the paper and is never shrunk to fit. One
 * path (`layoutOnSheet`) boxes, pages, clips and sizes every kind; only the
 * layout function differs. A viewport with no box (0 × 0, from before) takes
 * the sheet's drawing area. The register shrinks its rows instead (`registerFit`).
 */

import { ISO_PAPERS } from './paper';
import { withContinuationPages } from './continuation-pages';
import { useProjectStore } from './project-store';
import { layoutOnSheet, layoutTableOnSheet, registerHolders, scheduleBox, scheduleHomeBox, sheetDrawingArea } from '@bimvoice/ifcsheet';
import { scheduleScaleOf, withScheduleScale } from './schedule-scale';
import { layoutSchedule, scheduleMinBox, schedulePages, type ScheduleLabels, type ScheduleLayout, type ScheduleLayoutOptions } from '@/joinery/schedule-layout';
import type { ElementViews } from '@/joinery/element-views';
import type { ScheduleData } from '@/joinery/schedule-data';
import type { Rect } from './sheet-frame';
import type { Paper, ProjectSchedule, ProjectSheet, SheetViewport } from './types';

// Where a schedule sits on the paper is the engine's (`schedule-place.ts`), so `ifcsheet build` prints a placed schedule where the sheet shows it (#479).
export { layoutOnSheet, layoutTableOnSheet, scheduleBox, scheduleHomeBox };

/** The schedules that fit their viewport's box (all but the register, which has its own fit): `layoutOnSheet`. */
export function isFittedSchedule(schedule: Pick<ProjectSchedule, 'kind'> | undefined): boolean {
  return !!schedule && schedule.kind !== 'register';
}

/** The schedules whose table wraps to its viewport's width: the joinery lists (`layoutJoineryOnSheet`). */
export function isJoinerySchedule(schedule: Pick<ProjectSchedule, 'kind'> | undefined): boolean {
  return schedule?.kind === 'door' || schedule?.kind === 'window' || schedule?.kind === 'all';
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
 * each continuation sheet's viewport on the first one's box and scale. A continuation page follows the first
 * sheet's position too, until the user moves it (`placed`): from then on it keeps the place it was given. One write,
 * and none when nothing changes.
 */
export function syncSchedulePages(scheduleId: string, pages: number): void {
  const { sheets: held, schedules } = useProjectStore.getState();
  // The schedule's scale is the one the layout read (`schedule-scale`): a viewport's copy that drifted from it is put back with the pages.
  const schedule = schedules?.find((s) => s.id === scheduleId);
  const sheets = schedule ? withScheduleScale(held, scheduleId, scheduleScaleOf(schedule)) : held;
  const counted = withContinuationPages(sheets, scheduleId, pages) ?? sheets;
  const home = registerHolders(counted, scheduleId)[0]?.viewports?.find((v) => v.viewId === scheduleId);
  const same = (v: SheetViewport) => !home || ((v.placed || (v.x === home.x && v.y === home.y)) && v.width === home.width && v.height === home.height && v.scale === home.scale);
  const followed = home
    ? counted.map((s) => (!(s.viewports ?? []).some((v) => v.viewId === scheduleId && (v.page ?? 0) > 0 && !same(v))
      ? s
      : { ...s, viewports: (s.viewports ?? []).map((v) => ((v.page ?? 0) > 0 && v.viewId === scheduleId ? { ...v, ...(v.placed ? {} : { x: home.x, y: home.y }), width: home.width, height: home.height, scale: home.scale } : v)) }))
    : counted;
  if (followed.some((s, i) => s !== held[i]) || followed.length !== held.length) useProjectStore.setState({ sheets: followed, dirty: true });
}

/** How many sheets `data` takes in `box` at `scale`. */
export function pagesIn(data: ScheduleData, scale: number, box: Rect): number {
  return schedulePages(data, boxOptions(box, scale));
}

/**
 * What a joinery schedule's layout reads, whoever asks: the box of the schedule's first sheet at the schedule's scale, with the
 * element views its cards draw. The sheet's pages (`layoutJoineryOnSheet`) and the count the split offer quotes (`joineryPages`) both
 * take their options from here, so they cannot count differently.
 */
function joineryOptions(wrap: Rect, scale: number, views: ReadonlyMap<string, ElementViews> | undefined): ScheduleLayoutOptions {
  return { ...boxOptions(wrap, scale), views };
}

/** How many sheets a joinery schedule takes as the Wall lays it out: exactly the `pages` of `layoutJoineryOnSheet` for the same input. */
export function joineryPages(
  input: { data: ScheduleData; scale: number; views?: ReadonlyMap<string, ElementViews>; sheets: readonly ProjectSheet[]; sheet: ProjectSheet; vp: SheetViewport },
): number {
  const { data, scale, views, sheets, sheet, vp } = input;
  return schedulePages(data, joineryOptions(scheduleHomeBox(sheets, vp.viewId, sheet, vp), scale, views));
}

/** A joinery schedule's page: wrapped to the first sheet's box at its scale (`layoutSchedule`). */
export function layoutJoineryOnSheet(
  input: { data: ScheduleData; labels: ScheduleLabels; scale: number; views?: ReadonlyMap<string, ElementViews>; continued?: string; sheets: readonly ProjectSheet[]; sheet: ProjectSheet; vp: SheetViewport },
): ScheduleLayout {
  const { data, labels, scale, views, continued, ...place } = input;
  return layoutOnSheet(place, (wrap, page) => layoutSchedule(data, labels, { ...joineryOptions(wrap, scale, views), page, continued }), scheduleMinBox(data, { scale, views }));
}

