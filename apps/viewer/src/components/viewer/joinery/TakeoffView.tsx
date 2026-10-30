/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A material takeoff on its own: the table as it prints, and its CSV.
 * Placed on a sheet it draws through `useSheetSchedules` like a joinery
 * schedule.
 */

import { useMemo } from 'react';
import { useTranslation } from '@/i18n';
import type { ProjectSchedule } from '@/project/types';
import { ScheduleExportButtons } from '../wall/ScheduleExportButtons';
import { TAB_EXPORT } from '../wall/wall-type';
import { ScheduleGraphic, useTakeoffLabels, useTakeoffRows } from './ScheduleGraphic';
import { layoutMaterialTakeoff } from '@bimvoice/ifcsheet';

const MARGIN = 10;
const ZOOM = 3;

export function TakeoffView({ schedule }: { schedule: ProjectSchedule }) {
  const { t } = useTranslation();
  const rows = useTakeoffRows();
  const labels = useTakeoffLabels(schedule.name);
  const layout = useMemo(() => layoutMaterialTakeoff(rows, labels), [rows, labels]);
  const w = layout.width + 2 * MARGIN, h = layout.height + 2 * MARGIN;
  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex shrink-0 items-center gap-2 h-9 px-2 border-b border-zinc-200 dark:border-zinc-800 text-xs">
        <span className="font-semibold truncate">{schedule.name}</span>
        <span className="flex-1" />
        <ScheduleExportButtons schedule={schedule} className={TAB_EXPORT} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-zinc-200 p-4 dark:bg-zinc-900">
        {rows.length === 0 ? <p className="p-4 text-sm text-zinc-500">{t('takeoff.empty')}</p> : (
          <svg xmlns="http://www.w3.org/2000/svg" width={w * ZOOM} height={h * ZOOM} viewBox={`${-MARGIN} ${-MARGIN} ${w} ${h}`} className="block bg-white shadow-lg">
            <rect x={-MARGIN} y={-MARGIN} width={w} height={h} fill="#fff" />
            <ScheduleGraphic layout={layout} />
          </svg>
        )}
      </div>
    </div>
  );
}
