/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The detail of a joinery type's views (#449): which type, how much of it to draw, hiding single lines (switch on, then click a
 * line in the schedule) and showing them again. The choice is the type's, so every schedule that shows it follows.
 */

import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui/button';
import { useProjectStore } from '@/project/project-store';
import { JOINERY_VIEW_DETAILS } from '@bimvoice/ifcsheet/project';
import type { JoineryViewDetail } from '@ifc-lite/create';
import type { ScheduleData } from '@/joinery/schedule-data';
import { setViewDetail, showHiddenViewLines } from '@/joinery/view-choice-actions';

const SELECT = 'h-7 rounded-sm border border-zinc-300 dark:border-zinc-700 bg-transparent px-1 text-xs';

export function ViewDetailControls({ data, typeId, onType, hiding, onHiding }: {
  data: ScheduleData; typeId: string | undefined; onType: (id: string) => void; hiding: boolean; onHiding: (on: boolean) => void;
}) {
  const { t } = useTranslation();
  const catalogue = useProjectStore((s) => s.joineryTypes);
  const types = data.entries.filter((e) => e.spec?.id);
  const spec = (catalogue ?? []).find((x) => x.id === typeId);
  if (types.length === 0) return null;
  const hidden = spec?.view?.hidden?.length ?? 0;
  return (
    <>
      <select aria-label={t('joinery.view.type')} className={SELECT} value={spec?.id ?? ''} onChange={(e) => onType(e.target.value)}>
        <option value="">{t('joinery.view.type')}</option>
        {types.map((e) => <option key={e.spec!.id} value={e.spec!.id}>{e.mark} · {e.name}</option>)}
      </select>
      {spec && (
        <>
          <select aria-label={t('joinery.view.detail')} className={SELECT} value={spec.view?.detail ?? 'all'} onChange={(e) => setViewDetail(spec.id!, e.target.value as JoineryViewDetail)}>
            {JOINERY_VIEW_DETAILS.map((d) => <option key={d} value={d}>{t(`joinery.view.detail.${d}`)}</option>)}
          </select>
          <Button size="sm" variant={hiding ? 'default' : 'ghost'} aria-pressed={hiding} onClick={() => onHiding(!hiding)} title={t('joinery.view.hideHint')}>{t('joinery.view.hide')}</Button>
          <Button size="sm" variant="ghost" disabled={hidden === 0} onClick={() => showHiddenViewLines(spec.id!)}>{t('joinery.view.showHidden', { count: hidden })}</Button>
        </>
      )}
    </>
  );
}
