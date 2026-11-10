/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where a schedule sits on the paper (#186): the box its viewport gives the table (its own, or the sheet's drawing area while it has
 * none), the box every page is wrapped to (the schedule's first sheet's), and the page a viewport shows. The app's sheets
 * (`apps/viewer/src/project/schedule-fit.ts`) and the engine's (`sheet-schedules.ts`, the PDF of `ifcsheet build`) place a
 * schedule with this one code, so a placed schedule prints where the app shows it (#479).
 */

import type { ProjectSheet, SheetViewport } from './document.js';
import { drawingAreaIn, frameOf, type Rect } from './sheet-frame.js';
import { paperOf } from './viewport-fit.js';
import type { ScheduleLayout } from './schedule-prim.js';

/**
 * The sheet's drawing area, paper mm: inside its frame's margins, beside its
 * title block. The same `drawingAreaIn` the sheet SVG and the scales read, so
 * a resize cannot stop short of, or run past, the area the sheet draws.
 */
export function sheetDrawingArea(sheet: ProjectSheet): Rect {
  return drawingAreaIn(paperOf(sheet), frameOf(sheet));
}

/** The sheets that hold the register `registerId`, by the page each shows: its own sheet first, then its continuation sheets. */
export function registerHolders<S extends Pick<ProjectSheet, 'viewports'>>(sheets: readonly S[], registerId: string): S[] {
  const pageOf = (s: S) => (s.viewports ?? []).find((vp) => vp.viewId === registerId)?.page ?? 0;
  return sheets.filter((s) => (s.viewports ?? []).some((vp) => vp.viewId === registerId)).sort((a, b) => pageOf(a) - pageOf(b));
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

/**
 * The page of the schedule that viewport `vp` of `sheet` shows, whatever its kind: `build` lays out one page for the box of the
 * schedule's first sheet (so every page agrees on where the breaks fall), the result is given the box `vp` draws into, and the
 * smallest box a resize may shrink it to (`min`, else the layout's own `minBox`).
 */
export function layoutOnSheet(
  input: { sheets: readonly ProjectSheet[]; sheet: ProjectSheet; vp: SheetViewport },
  build: (wrap: Rect, page: number) => ScheduleLayout,
  min?: { width: number; height: number },
): ScheduleLayout {
  const { sheets, sheet, vp } = input;
  const layout = build(scheduleHomeBox(sheets, vp.viewId, sheet, vp), vp.page ?? 0);
  const floor = min ?? layout.minBox;
  return floor ? { ...layout, fit: { box: scheduleBox(sheet, vp), min: floor } } : layout;
}

/** A column table's page (takeoff, finishes, types, urban): `layout` lays out the rows that fit the first sheet's box height. */
export function layoutTableOnSheet(
  input: { continued?: string; sheets: readonly ProjectSheet[]; sheet: ProjectSheet; vp: SheetViewport },
  layout: (paging: { maxHeight: number; page: number; continued?: string }) => ScheduleLayout,
): ScheduleLayout {
  const { continued, ...place } = input;
  return layoutOnSheet(place, (wrap, page) => layout({ maxHeight: wrap.h, page, continued }));
}
