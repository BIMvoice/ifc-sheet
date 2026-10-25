/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The viewport card's part for a schedule built from the Lists engine (#78): which columns print and in which order (the Content section's job
 * for a joinery schedule), the totals row, and the button that opens the builder. Nothing for any other schedule.
 */

import { useState } from 'react';
import type { ProjectSchedule } from '@/project/types';
import { useTranslation } from '@/i18n';
import { moveListColumn, setListColumnHidden, setListTotals } from '@/joinery/list-schedule-actions';
import { CardSection } from '../wall/CardSection';
import { WALL_PILL } from '../wall/wall-type';
import { ListScheduleBuilder } from './ListScheduleBuilder';

export function ListScheduleCard({ schedule }: { schedule: ProjectSchedule }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const list = schedule.list;
  if (schedule.kind !== 'list' || !list) return null;
  const grouped = (list.groupBy ?? []).length > 0;
  const name = (id: string) => { const c = list.columns.find((x) => x.id === id); return c?.label ?? c?.propertyName ?? id; };
  const summary = grouped ? t('listSched.card.summaryGrouped', { columns: list.columns.length, groups: (list.groupBy ?? []).map(name).join(', ') }) : t('listSched.card.summary', { columns: list.columns.length });
  return (
    <CardSection id="list" title={t('listSched.card.title')} summary={summary} defaultOpen={list.columns.some((c) => c.hidden) || list.totals === false}>
      <p className="m-0 mt-1 text-xs text-sky-200">{t('listSched.card.hint')}</p>
      <ul className="m-0 mt-2 list-none p-0">
        {list.columns.map((c, i) => (
          <li key={c.id} className="flex items-center gap-2 py-0.5 text-sm text-sky-100">
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <input type="checkbox" checked={!c.hidden} aria-label={t(c.hidden ? 'listSched.builder.show' : 'listSched.builder.hide', { name: name(c.id) })} onChange={(e) => setListColumnHidden(schedule.id, c.id, !e.target.checked)} />
              <span className="truncate">{name(c.id)}</span>
            </label>
            <button type="button" className={WALL_PILL} disabled={i === 0} aria-label={t('listSched.builder.up', { name: name(c.id) })} onClick={() => moveListColumn(schedule.id, c.id, -1)}>↑</button>
            <button type="button" className={WALL_PILL} disabled={i === list.columns.length - 1} aria-label={t('listSched.builder.down', { name: name(c.id) })} onClick={() => moveListColumn(schedule.id, c.id, 1)}>↓</button>
          </li>
        ))}
      </ul>
      {grouped ? (
        <label className="mt-2 flex items-center gap-2 text-xs text-sky-100">
          <input type="checkbox" checked={list.totals !== false} onChange={(e) => setListTotals(schedule.id, e.target.checked)} />
          {t('listSched.builder.totals')}
        </label>
      ) : null}
      <button type="button" className={`${WALL_PILL} mt-3`} onClick={() => setOpen(true)}>{t('listSched.card.edit')}</button>
      {open ? <ListScheduleBuilder schedule={schedule} onClose={() => setOpen(false)} /> : null}
    </CardSection>
  );
}
