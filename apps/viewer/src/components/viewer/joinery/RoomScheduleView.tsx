/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The room and area schedule on its own (#42): the table as it prints, with its
 * CSV (the engine's, so the command line writes the same). Placed on a sheet it
 * draws through `useSheetSchedules` like the other schedules.
 */

import { useMemo } from 'react';
import { Download } from 'lucide-react';
import { roomScheduleCsv } from '@bimvoice/ifcsheet';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui/button';
import { downloadFile, sanitizeFilename } from '@/lib/export/download';
import { layoutRoomSchedule } from '@/joinery/room-schedule-layout';
import type { ProjectSchedule } from '@/project/types';
import { ScheduleGraphic } from './ScheduleGraphic';
import { useRoomScheduleData, useRoomScheduleLabels } from './room-schedule-hooks';

const MARGIN = 10;
const ZOOM = 3;

export function RoomScheduleView({ schedule }: { schedule: ProjectSchedule }) {
  const { t, locale } = useTranslation();
  const data = useRoomScheduleData();
  const labels = useRoomScheduleLabels(schedule.name, data);
  const layout = useMemo(() => (data ? layoutRoomSchedule(data.schedule, labels) : null), [data, labels]);
  const stem = sanitizeFilename(schedule.name, { fallback: 'rooms' });
  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex shrink-0 items-center gap-2 h-9 px-2 border-b border-zinc-200 dark:border-zinc-800 text-xs">
        <span className="font-semibold truncate">{schedule.name}</span>
        <span className="flex-1" />
        <Button size="sm" variant="outline" disabled={!data} onClick={() => data && downloadFile(roomScheduleCsv(data.schedule, locale), `${stem}.csv`, 'text/csv')}><Download className="mr-1 size-3.5" />{t('schedule.export.csv')}</Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-zinc-200 p-4 dark:bg-zinc-900">
        {!layout ? <p className="p-4 text-sm text-zinc-500">{t('roomSched.empty')}</p> : (
          <svg xmlns="http://www.w3.org/2000/svg" width={(layout.width + 2 * MARGIN) * ZOOM} height={(layout.height + 2 * MARGIN) * ZOOM} viewBox={`${-MARGIN} ${-MARGIN} ${layout.width + 2 * MARGIN} ${layout.height + 2 * MARGIN}`} className="block bg-white shadow-lg">
            <rect x={-MARGIN} y={-MARGIN} width={layout.width + 2 * MARGIN} height={layout.height + 2 * MARGIN} fill="#fff" />
            <ScheduleGraphic layout={layout} />
          </svg>
        )}
      </div>
    </div>
  );
}
