/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * When a joinery schedule hung on the set does not fit the paper at its scale (#186), the Wall offers to split it into
 * sub-reports that do (doors and windows apart, one per storey), or to keep it paging on A-6xx.1… as it does by default.
 * This decides whether, and what, to offer; it changes nothing.
 */

import { canSplit, subReportsOf } from '@bimvoice/ifcsheet';
import { pagesIn } from '@/project/schedule-fit';
import type { Rect } from '@/project/sheet-frame';
import type { ProjectSchedule } from '@/project/types';
import type { ScheduleData } from './schedule-data';

export interface SplitOffer {
  /** The sheets the schedule takes now (always more than one). */
  pages: number;
  /** Doors and windows can be told apart (a schedule of both, with both present). */
  byKind: boolean;
  /** The storeys it lists, when there is more than one to split by. */
  levels: string[];
}

/**
 * The offer for `schedule` listing `data` at `scale` in `box`: null while it fits one sheet, once it has sub-reports (the checks
 * on its card take over), when it cannot be split, or when no split would divide it.
 */
export function splitOfferFor(schedule: ProjectSchedule, schedules: readonly ProjectSchedule[], data: ScheduleData, scale: number, box: Rect): SplitOffer | null {
  if (!canSplit(schedule) || subReportsOf(schedules, schedule.id).length > 0) return null;
  const pages = pagesIn(data, scale, box);
  if (pages <= 1) return null;
  const kinds = new Set(data.entries.map((e) => e.kind));
  const byKind = schedule.kind === 'all' && kinds.size > 1;
  const levels = data.levels.length > 1 ? data.levels : [];
  return byKind || levels.length > 0 ? { pages, byKind, levels } : null;
}
