/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where a joinery schedule sits on the paper (#186, #581): its cards wrap into bands at the width of the box of the schedule's first
 * sheet, and the bands that do not fit its height go on the next page. The app's sheets (`apps/viewer/src/project/schedule-fit.ts`) and
 * `ifcsheet build --project` (`project-sheets.ts`) place a joinery schedule with this one code, so a sheet and its PDF break the bands
 * in the same places. The generic placement (`layoutOnSheet`) is `schedule-place.ts`.
 */

import type { ProjectSheet, SheetViewport } from './document.js';
import type { ElementViews } from './joinery-element-views.js';
import type { ScheduleData } from './joinery-schedule.js';
import { joineryScheduleLayout, scheduleMinBox, schedulePages, type ScheduleLabels, type ScheduleLayoutOptions } from './joinery-schedule-layout.js';
import { layoutOnSheet, scheduleHomeBox } from './schedule-place.js';
import type { ScheduleLayout } from './schedule-prim.js';
import type { Rect } from './sheet-frame.js';

/** The layout options that wrap a table into `box` at `scale`. */
export function boxOptions(box: Rect, scale: number): Pick<ScheduleLayoutOptions, 'scale' | 'maxWidth' | 'maxHeight'> {
  return { scale, maxWidth: box.w, maxHeight: box.h };
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

/** A joinery schedule's page: wrapped to the first sheet's box at its scale (`joineryScheduleLayout`). `convention` is the project's opening-line convention. */
export function layoutJoineryOnSheet(
  input: {
    data: ScheduleData; labels: ScheduleLabels; scale: number; views?: ReadonlyMap<string, ElementViews>; continued?: string; convention?: ScheduleLayoutOptions['convention'];
    sheets: readonly ProjectSheet[]; sheet: ProjectSheet; vp: SheetViewport;
  },
): ScheduleLayout {
  const { data, labels, scale, views, continued, convention, ...place } = input;
  return layoutOnSheet(place, (wrap, page) => joineryScheduleLayout(data, labels, { ...joineryOptions(wrap, scale, views), page, continued, convention }), scheduleMinBox(data, { scale, views }));
}
