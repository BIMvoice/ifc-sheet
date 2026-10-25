/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A schedule built from the Lists engine in its own tab (#78): the table as it prints, with its CSV and XLSX (the one writer every
 * schedule uses). Placed on a sheet it draws through `useSheetSchedules` like the other schedules.
 */

import type { ProjectSchedule } from '@/project/types';
import { ScheduleExportButtons } from '../wall/ScheduleExportButtons';
import { TAB_EXPORT } from '../wall/wall-type';
import { ListSchedulePreview } from './ListSchedulePreview';

export function ListScheduleView({ schedule }: { schedule: ProjectSchedule }) {
  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-zinc-200 px-2 text-xs dark:border-zinc-800">
        <span className="truncate font-semibold">{schedule.name}</span>
        <span className="flex-1" />
        <ScheduleExportButtons schedule={schedule} className={TAB_EXPORT} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-zinc-200 p-4 dark:bg-zinc-900">
        <ListSchedulePreview schedule={schedule} />
      </div>
    </div>
  );
}
