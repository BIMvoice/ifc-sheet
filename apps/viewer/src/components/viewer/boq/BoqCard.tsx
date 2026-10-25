/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The viewport card's part for a bill of quantities on a sheet (#75): how many articles the mapping table holds, whether the rows per type are
 * printed, what the model could not state, and the button that opens the table. Nothing for any other schedule.
 */

import { useState } from 'react';
import { boqMissing } from '@bimvoice/ifcsheet';
import { useTranslation } from '@/i18n';
import { setBoqDetail } from '@/boq/boq-actions';
import type { ProjectSchedule } from '@/project/types';
import { CardSection } from '../wall/CardSection';
import { WALL_PILL } from '../wall/wall-type';
import { BoqDialog } from './BoqDialog';
import { useBoqArticles, useBoqResult } from './useBoq';

export function BoqCard({ schedule }: { schedule: ProjectSchedule }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const articles = useBoqArticles();
  const result = useBoqResult(schedule.kind === 'boq');
  if (schedule.kind !== 'boq') return null;
  const missing = boqMissing(result);
  return (
    <CardSection id="boq" title={t('boq.card.title')} summary={articles.length === 0 ? t('boq.card.summaryEmpty') : t('boq.card.summary', { count: articles.length })} defaultOpen={articles.length === 0 || missing.elements > 0} warn={missing.elements > 0}>
      <p className="m-0 mt-1 text-xs text-sky-200">{t('boq.card.hint')}</p>
      {missing.elements > 0 ? <p className="m-0 mt-2 text-xs text-amber-200">{t('boq.card.missing', { count: missing.elements })}</p> : null}
      <label className="mt-3 flex items-center gap-2 text-xs text-sky-100">
        <input type="checkbox" checked={schedule.detail === true} onChange={(e) => setBoqDetail(schedule.id, e.target.checked)} />
        {t('boq.card.detail')}
      </label>
      <button type="button" className={`${WALL_PILL} mt-3`} onClick={() => setOpen(true)}>{t('boq.card.edit')}</button>
      {open ? <BoqDialog schedule={schedule} onClose={() => setOpen(false)} /> : null}
    </CardSection>
  );
}
