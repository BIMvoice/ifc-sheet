/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** A schedule built from the Lists engine as it prints (#78), in paper millimetres: in its own tab and in the builder's preview. */

import { useMemo } from 'react';
import { useTranslation } from '@/i18n';
import { useSheetLocale } from '@/project/units-and-numbers';
import type { ProjectSchedule } from '@/project/types';
import { layoutListSchedule } from '@/joinery/list-schedule-layout';
import { ScheduleGraphic } from '../joinery/ScheduleGraphic';
import { useListScheduleRun, useListTable } from './useListSchedule';

const MARGIN = 10;

export function ListSchedulePreview({ schedule, zoom = 3 }: { schedule: ProjectSchedule; zoom?: number }) {
  const { t } = useTranslation();
  const locale = useSheetLocale();
  const state = useListScheduleRun(schedule);
  const table = useListTable(schedule, state);
  const layout = useMemo(() => (table ? layoutListSchedule(table, { locale, title: schedule.name }) : null), [table, locale, schedule.name]);
  if (state?.status === 'error') return <p className="p-4 text-sm text-red-500">{t('listSched.error', { reason: state.message })}</p>;
  if (!layout || table?.rows.length === 0) return <p className="p-4 text-sm text-zinc-500">{state?.status === 'resolving' ? t('listSched.resolving') : t('listSched.empty')}</p>;
  const w = layout.width + 2 * MARGIN, h = layout.height + 2 * MARGIN;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={w * zoom} height={h * zoom} viewBox={`${-MARGIN} ${-MARGIN} ${w} ${h}`} className="block bg-white shadow-lg">
      <rect x={-MARGIN} y={-MARGIN} width={w} height={h} fill="#fff" />
      <ScheduleGraphic layout={layout} />
    </svg>
  );
}
