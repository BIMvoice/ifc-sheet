/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The mark a plan gives a door or window (`tagall/mark-codes.ts`) in the
 * schedule: a row the schedule groups without a configured type takes the
 * code its occurrences carry on the plans, so the mark on the plan and the
 * mark in the row are the same. Rows of a configured type keep that type's mark.
 */

import type { DraftEntity } from '@/drafting/types';
import type { ScheduleEntry } from './schedule-data';

/** The code each door and window carries on the plans, by GlobalId. */
export function drawnCodes(drafts: readonly DraftEntity[]): Map<string, string> {
  return new Map(drafts.flatMap((d): [string, string][] => (typeof d.params.labelOf === 'string' && typeof d.params.markCode === 'string' ? [[d.params.labelOf, d.params.markCode]] : [])));
}

/** `entries` with the unconfigured rows marked by their occurrences' codes (`W1`, or `W1/W2` where a row spans kinds). */
export function withDrawnMarks(entries: readonly ScheduleEntry[], codes: ReadonlyMap<string, string>): ScheduleEntry[] {
  return entries.map((e) => {
    if (e.spec) return e;
    const mine = [...new Set(e.occurrences.flatMap((o) => codes.get(o.globalId) ?? []))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    return mine.length ? { ...e, mark: mine.join('/') } : e;
  });
}
