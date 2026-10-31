/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The door and window schedule's way into its drawable views (#492, #656): choose a type and its front, plan or section, and "Open to
 * draw in" steps into that view (`JoineryViewDrafting`, through the sheet). What is drawn belongs to the type and prints on every
 * schedule that shows it. The model is not changed.
 */

import { useState } from 'react';
import type { JoineryViewName } from '@bimvoice/ifcsheet/project';
import { useTranslation } from '@/i18n';
import type { ProjectSchedule } from '@/project/types';
import { joineryDraftSource } from '../joinery/joinery-draft-source';
import { useScheduleLayout } from '../joinery/ScheduleGraphic';
import type { JoineryDraft } from '../joinery/JoineryDraftHost';
import { WALL_FIELD, WALL_LABEL, WALL_PILL } from './wall-type';

const VIEWS = [
  { view: 'front', label: 'joinery.draft.view.front' },
  { view: 'plan', label: 'joinery.draft.view.plan' },
  { view: 'section', label: 'joinery.draft.view.section' },
] as const satisfies readonly { view: JoineryViewName; label: string }[];

export function JoineryDrawInCard({ schedule, onDrawIn }: { schedule: ProjectSchedule; onDrawIn: (draft: JoineryDraft) => void }) {
  const { t } = useTranslation();
  const result = useScheduleLayout(schedule);
  const [chosenType, setChosenType] = useState<string>();
  const [view, setView] = useState<JoineryViewName>('front');
  if (!result) return null;
  const types = result.data.entries.filter((e) => e.spec?.id);
  const typeId = types.find((e) => e.spec?.id === chosenType)?.spec?.id ?? types[0]?.spec?.id;
  const ready = typeId !== undefined && joineryDraftSource(result, typeId) !== null;
  return (
    <section data-joinery-draw-in className="mt-4 border-t border-sky-300/20 pt-3">
      <p className="m-0 text-2xs font-medium uppercase tracking-widest text-cyan-400">{t('joinery.reach.draw.title')}</p>
      {types.length === 0 ? <p className="mb-0 mt-2 text-xs text-sky-200">{t('joinery.reach.draw.none')}</p> : (
        <>
          <label className={`${WALL_LABEL} mt-2`}>
            {t('joinery.reach.draw.type')}
            <select className={WALL_FIELD} value={typeId} onChange={(e) => setChosenType(e.target.value)}>
              {types.map((e) => <option key={e.spec?.id} value={e.spec?.id}>{`${e.mark} · ${e.name}`}</option>)}
            </select>
          </label>
          <label className={`${WALL_LABEL} mt-2`}>
            {t('joinery.reach.draw.view')}
            <select className={WALL_FIELD} value={view} onChange={(e) => setView(e.target.value as JoineryViewName)}>
              {VIEWS.map((v) => <option key={v.view} value={v.view}>{t(v.label)}</option>)}
            </select>
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" className={WALL_PILL} disabled={!ready} onClick={() => { if (typeId !== undefined) onDrawIn({ scheduleId: schedule.id, typeId, view, name: `${types.find((e) => e.spec?.id === typeId)?.mark ?? ''} ${t(VIEWS.find((v) => v.view === view)?.label ?? 'joinery.draft.view.front')}` }); }}>{t('joinery.reach.draw.open')}</button>
            {ready ? null : <span className="text-xs text-sky-200">{t('joinery.reach.draw.cutting')}</span>}
          </div>
        </>
      )}
    </section>
  );
}
