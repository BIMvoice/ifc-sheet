/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The bill of quantities on its own, as a schedule tab (#75): the mapping table, the totals per article, the CSV and XLSX of the table, and the
 * button that places the summary on a sheet. On the Wall the same table opens from the viewport card (`BoqCard`).
 */

import { useViewerStore } from '@/store';
import { useTranslation } from '@/i18n';
import { hangSchedule } from '@/project/drawing-set-actions';
import { useProjectStore } from '@/project/project-store';
import { toast } from '@/components/ui/toast';
import type { ProjectSchedule } from '@/project/types';
import { setBoqDetail } from '@/boq/boq-actions';
import { ScheduleExportButtons } from '../wall/ScheduleExportButtons';
import { TAB_EXPORT } from '../wall/wall-type';
import { BoqEditor } from './BoqEditor';
import { BoqPreview } from './BoqPreview';

export function BoqView({ schedule }: { schedule: ProjectSchedule }) {
  const { t } = useTranslation();
  const noModel = useViewerStore((s) => s.models.size === 0);
  const sheets = useProjectStore((s) => s.sheets);
  const place = () => {
    const id = hangSchedule(schedule.id);
    const sheet = useProjectStore.getState().sheets.find((s) => s.id === id);
    if (sheet) toast.success(t('boq.view.placed', { number: sheet.number }));
  };
  const placedOn = sheets.find((s) => (s.viewports ?? []).some((vp) => vp.viewId === schedule.id));
  return (
    <div className="flex h-full w-full flex-col bg-[#061a36] text-sky-100">
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-sky-300/20 px-2 text-xs">
        <span className="font-semibold">{schedule.name}</span>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={schedule.detail === true} onChange={(e) => setBoqDetail(schedule.id, e.target.checked)} />
          {t('boq.card.detail')}
        </label>
        <span className="flex-1" />
        {noModel ? <span className="text-amber-200">{t('boq.view.noModel')}</span> : null}
        <button type="button" className="rounded-sm border border-sky-300/30 px-2 py-0.5 hover:border-sky-300/70" onClick={place}>{placedOn ? t('boq.view.placed', { number: placedOn.number }) : t('boq.view.place')}</button>
        <ScheduleExportButtons schedule={schedule} className={TAB_EXPORT} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <BoqEditor />
        <div className="mt-6 border-t border-sky-300/20 pt-4"><BoqPreview schedule={schedule} /></div>
      </div>
    </div>
  );
}
