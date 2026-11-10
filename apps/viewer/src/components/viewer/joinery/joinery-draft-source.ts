/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What `JoineryViewDrafting` is given for a type of a joinery schedule: the type's spec and its cut views. One reading, for the schedule
 * tab (`ScheduleView`) and the sheet's card (`JoineryDraftHost`), so the two cannot disagree on which type can be drawn on (#492, #656).
 */

import type { JoinerySpec } from '@ifc-lite/create';
import type { ElementViews } from '@/joinery/element-views';
import type { useScheduleLayout } from './ScheduleGraphic';

export interface JoineryDraftSource { spec: JoinerySpec; views: ElementViews }

/** The type `typeId` of the schedule's data with its views, or null while the views are being cut or when the type is not in the schedule. */
export function joineryDraftSource(result: NonNullable<ReturnType<typeof useScheduleLayout>>, typeId: string): JoineryDraftSource | null {
  const entry = result.data.entries.find((en) => en.spec?.id === typeId);
  const views = entry ? result.views?.get(entry.key) : undefined;
  return entry?.spec && views ? { spec: entry.spec, views } : null;
}
