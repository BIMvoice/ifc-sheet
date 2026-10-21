/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The permit's areas and urban indicators on their own: the table as it
 * prints, with the site area beside it. Placed on a sheet it draws through
 * `useSheetSchedules` like the other schedules.
 */

import { useMemo } from 'react';
import { useTranslation } from '@/i18n';
import { layoutUrban } from '@/urban/urban-layout';
import type { ProjectSchedule } from '@/project/types';
import { ScheduleGraphic } from '../joinery/ScheduleGraphic';
import { SiteAreaField } from './SiteAreaField';
import { CutLevelToggles, UrbanLevelFields } from './UrbanSettingsFields';
import { useUrbanIndicators, useUrbanLabels } from './useUrban';

const MARGIN = 10;
const ZOOM = 3;

export function UrbanView({ schedule }: { schedule: ProjectSchedule }) {
  const { t } = useTranslation();
  const urban = useUrbanIndicators();
  const labels = useUrbanLabels(schedule.name, urban?.areas ?? null);
  const layout = useMemo(() => (urban ? layoutUrban(urban.result, labels) : null), [urban, labels]);
  const measured = urban?.result.storeys.some((s) => s.builtArea !== null) ?? false;
  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex shrink-0 items-center gap-2 h-9 px-2 border-b border-zinc-200 dark:border-zinc-800 text-xs">
        <span className="font-semibold truncate">{schedule.name}</span>
        <span className="flex-1" />
        <UrbanLevelFields result={urban?.result ?? null} />
        <SiteAreaField modelSiteArea={urban?.areas.modelSiteArea ?? null} />
      </div>
      {urban && urban.result.storeys.length > 0 ? <CutLevelToggles result={urban.result} /> : null}
      <div className="min-h-0 flex-1 overflow-auto bg-zinc-200 p-4 dark:bg-zinc-900">
        {!layout || !measured ? <p className="p-4 text-sm text-zinc-500">{t('urban.empty')}</p> : (
          <svg xmlns="http://www.w3.org/2000/svg" width={(layout.width + 2 * MARGIN) * ZOOM} height={(layout.height + 2 * MARGIN) * ZOOM} viewBox={`${-MARGIN} ${-MARGIN} ${layout.width + 2 * MARGIN} ${layout.height + 2 * MARGIN}`} className="block bg-white shadow-lg">
            <rect x={-MARGIN} y={-MARGIN} width={layout.width + 2 * MARGIN} height={layout.height + 2 * MARGIN} fill="#fff" />
            <ScheduleGraphic layout={layout} />
          </svg>
        )}
      </div>
    </div>
  );
}
