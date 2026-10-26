/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * CSV and XLSX of a schedule (#80): on the viewport card of a placed schedule, in the drawer's list of them, and in the schedule's own
 * tab, for every kind. One writer each (`schedule-export.ts`) over the table the sheet draws (`schedule-export-read.ts`).
 */

import { useMemo, useState } from 'react';
import { useTranslation } from '@/i18n';
import { toast } from '@/components/ui/toast';
import { downloadFile } from '@/lib/export/download';
import type { ProjectSchedule } from '@/project/types';
import { CSV_MIME, csvDelimiter, exportCsv, exportXlsx, scheduleFileName, XLSX_MIME } from '@/joinery/schedule-export';
import { useRegisterLabels, useRoomFinishLabels, useScheduleLabels, useTakeoffLabels, useTypeQuantityLabels } from '../joinery/ScheduleGraphic';
import { urbanLabelsOf } from '../urban/useUrban';
import { roomScheduleLabelsOf } from '../joinery/room-schedule-hooks';
import { readScheduleExport, type ExportLabelSet } from './schedule-export-read';
import { useBoqSay } from '../boq/useBoq';
import { useListWords } from '../lists/useListSchedule';
import { WALL_PILL } from './wall-type';
import { useSheetLocale } from '@/project/units-and-numbers';

type Format = 'csv' | 'xlsx';

/** The words of every kind's table, in the interface's language: the sheet's own label hooks, so a file's headings are the sheet's. */
export function useScheduleExportLabels(): ExportLabelSet {
  const { t } = useTranslation();
  const locale = useSheetLocale();
  const joinery = useScheduleLabels('');
  const takeoff = useTakeoffLabels('');
  const finishes = useRoomFinishLabels('');
  const types = useTypeQuantityLabels('');
  const register = useRegisterLabels('');
  const boq = useBoqSay();
  const list = useListWords();
  return useMemo<ExportLabelSet>(() => ({
    joinery: {
      ...joinery, widthMm: t('schedule.export.widthMm'), heightMm: t('schedule.export.heightMm'),
      types: t('schedule.sheet.types'), elements: t('schedule.sheet.elements'), number: t('schedule.col.number'), level: t('schedule.col.level'), globalId: t('schedule.col.globalId'),
    },
    takeoff, finishes, types, register, boq, list, asIndicated: t('sheets.asIndicated'),
    urban: (title, areas, site) => urbanLabelsOf(t, locale, title, areas, site),
    rooms: (title, data, summary) => roomScheduleLabelsOf(t, locale, title, data, summary),
  }), [joinery, takeoff, finishes, types, register, boq, list, t, locale]);
}

/** What pressing a button does: read the table, write the file in the language's delimiter, hand it to the browser. */
function useScheduleExport(schedule: ProjectSchedule): (format: Format) => Promise<void> {
  const { t } = useTranslation();
  const locale = useSheetLocale();
  const labels = useScheduleExportLabels();
  return async (format) => {
    try {
      const data = await readScheduleExport(schedule, labels);
      if (!data) { toast.error(t('wall.export.empty')); return; }
      const name = scheduleFileName(schedule.name, t('wall.export.fileName'), format);
      if (format === 'csv') downloadFile(exportCsv(data, { delimiter: csvDelimiter(locale) }), name, CSV_MIME);
      else downloadFile(await exportXlsx(data, { locale }), name, XLSX_MIME);
    } catch (err) {
      console.warn('[schedule export]', err);
      toast.error(t('wall.export.failed', { reason: err instanceof Error ? err.message : String(err) }));
    }
  };
}

/** The two buttons. `named` puts the schedule's name in their accessible labels (a list of them), `className` styles each. */
export function ScheduleExportButtons({ schedule, named = false, className = WALL_PILL }: { schedule: ProjectSchedule; named?: boolean; className?: string }) {
  const { t } = useTranslation();
  const run = useScheduleExport(schedule);
  const [busy, setBusy] = useState(false);
  const go = (format: Format) => { setBusy(true); void run(format).finally(() => setBusy(false)); };
  return (
    <>
      <button type="button" className={className} disabled={busy} aria-label={named ? t('wall.export.csvOf', { name: schedule.name }) : undefined} onClick={() => go('csv')}>{t('wall.export.csv')}</button>
      <button type="button" className={className} disabled={busy} aria-label={named ? t('wall.export.xlsxOf', { name: schedule.name }) : undefined} onClick={() => go('xlsx')}>{t('wall.export.xlsx')}</button>
    </>
  );
}
