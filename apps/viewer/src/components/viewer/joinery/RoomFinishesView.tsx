/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The room finishes on their own: the table as it prints, with its CSV and
 * XLSX. Placed on a sheet it draws through `useSheetSchedules` like the other
 * schedules.
 */

import { useMemo } from 'react';
import { Download } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui/button';
import { downloadFile, sanitizeFilename } from '@/lib/export/download';
import { layoutRoomFinishes, roomFinishesCsv } from '@/joinery/room-finishes-layout';
import { roomFinishesXlsx } from '@/joinery/room-finishes-xlsx';
import type { ProjectSchedule } from '@/project/types';
import { ScheduleGraphic, useRoomFinishes, useRoomFinishLabels } from './ScheduleGraphic';

const MARGIN = 10;
const ZOOM = 3;

export function RoomFinishesView({ schedule }: { schedule: ProjectSchedule }) {
  const { t } = useTranslation();
  const rooms = useRoomFinishes();
  const labels = useRoomFinishLabels(schedule.name);
  const layout = useMemo(() => layoutRoomFinishes(rooms, labels), [rooms, labels]);
  const w = layout.width + 2 * MARGIN, h = layout.height + 2 * MARGIN;
  const stem = sanitizeFilename(schedule.name, { fallback: 'finishes' });
  const exportXlsx = async () => {
    const blob = await roomFinishesXlsx(rooms, labels);
    downloadFile(blob, `${stem}.xlsx`, blob.type);
  };
  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex shrink-0 items-center gap-2 h-9 px-2 border-b border-zinc-200 dark:border-zinc-800 text-xs">
        <span className="font-semibold truncate">{schedule.name}</span>
        <span className="flex-1" />
        <Button size="sm" variant="outline" onClick={() => downloadFile(roomFinishesCsv(rooms, labels), `${stem}.csv`, 'text/csv')}><Download className="mr-1 size-3.5" />{t('schedule.export.csv')}</Button>
        <Button size="sm" variant="outline" onClick={() => void exportXlsx()}><Download className="mr-1 size-3.5" />{t('schedule.export.xlsx')}</Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-zinc-200 p-4 dark:bg-zinc-900">
        {rooms.length === 0 ? <p className="p-4 text-sm text-zinc-500">{t('finishes.empty')}</p> : (
          <svg xmlns="http://www.w3.org/2000/svg" width={w * ZOOM} height={h * ZOOM} viewBox={`${-MARGIN} ${-MARGIN} ${w} ${h}`} className="block bg-white shadow-lg">
            <rect x={-MARGIN} y={-MARGIN} width={w} height={h} fill="#fff" />
            <ScheduleGraphic layout={layout} />
          </svg>
        )}
      </div>
    </div>
  );
}
