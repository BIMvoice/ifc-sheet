/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The builder of a schedule from the Lists engine (#78), a window of its own over the Wall: pick the IFC classes and the filter, the columns (any
 * attribute, property or quantity of the loaded models), the grouping and the sums, with a preview that is the table the sheet will print. It
 * saves as a project schedule (`ListScheduleDef`) and, for a new one, hangs it on a sheet of its own. Esc closes it.
 */

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '@/i18n';
import type { ProjectSchedule } from '@/project/types';
import { addListScheduleToSet, setListSchedule } from '@/joinery/list-schedule-actions';
import { WALL_FIELD, WALL_LABEL, WALL_PILL } from '../wall/wall-type';
import { ListScheduleColumns } from './ListScheduleColumns';
import { ListSchedulePreview } from './ListSchedulePreview';
import { ListScheduleScope } from './ListScheduleScope';
import { defToDraft, draftToDef, emptyDraft, modelFacts, type ListDraft } from './list-schedule-draft';
import { useListProviders } from './useListProviders';

interface BuilderProps {
  /** The schedule being edited; absent: a new one. */
  schedule?: ProjectSchedule;
  onClose: () => void;
  /** After a new schedule is hung: its sheet's id. */
  onCreated?: (sheetId: string) => void;
}

export function ListScheduleBuilder({ schedule, onClose, onCreated }: BuilderProps) {
  const { t } = useTranslation();
  const { providers } = useListProviders();
  const facts = useMemo(() => modelFacts(providers), [providers]);
  const [draft, setDraft] = useState<ListDraft>(() => (schedule?.list ? defToDraft(schedule.name, schedule.list) : emptyDraft(t('listSched.newName'))));
  const set = (patch: Partial<ListDraft>) => setDraft((d) => ({ ...d, ...patch }));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  const def = useMemo(() => draftToDef(draft), [draft]);
  const name = draft.name.trim() || t('listSched.newName');
  // The preview follows the draft a beat behind, so typing a test value does not run the list on every key.
  const previewOf = useDeferredValue(useMemo<ProjectSchedule>(() => ({ id: schedule?.id ?? 'draft', name, kind: 'list', createdAt: 0, list: def }), [schedule?.id, name, def]));
  const save = (): void => {
    if (schedule) setListSchedule(schedule.id, def, name);
    else onCreated?.(addListScheduleToSet(name, def));
    onClose();
  };
  return createPortal(
    <dialog open aria-modal="true" aria-label={t(schedule ? 'listSched.builder.titleEdit' : 'listSched.builder.title')} data-owns-keys className="fixed inset-0 z-50 m-0 flex h-full max-h-none w-full max-w-none items-stretch justify-center border-0 bg-black/60 p-6">
      <div className="flex min-h-0 w-full max-w-6xl flex-col rounded-xl border border-sky-300/20 bg-[#061a36] text-sky-100 shadow-2xl">
        <header className="flex shrink-0 items-center gap-3 border-b border-sky-300/20 px-5 py-3">
          <h2 className="m-0 flex-1 text-xl font-normal text-white">{t(schedule ? 'listSched.builder.titleEdit' : 'listSched.builder.title')}</h2>
          <button type="button" className={WALL_PILL} onClick={onClose}>{t('listSched.builder.cancel')}</button>
          <button type="button" autoFocus className={`${WALL_PILL} border-sky-300 bg-sky-400/25 text-white`} disabled={def.columns.length === 0} onClick={save}>{t(schedule ? 'listSched.builder.save' : 'listSched.builder.create')}</button>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6 px-5 py-4">
          <div className="min-h-0 overflow-y-auto overscroll-contain pr-2">
            <p className="m-0 text-xs text-sky-200">{t('listSched.builder.intro')}</p>
            <label className={`${WALL_LABEL} mt-3`}>{t('listSched.builder.name')}<input className={WALL_FIELD} value={draft.name} onChange={(e) => set({ name: e.target.value })} /></label>
            <ListScheduleScope draft={draft} facts={facts} set={set} />
            <ListScheduleColumns draft={draft} facts={facts} set={set} />
          </div>
          <section aria-label={t('listSched.builder.preview')} className="flex min-h-0 flex-col">
            <p className="m-0 text-2xs font-medium uppercase tracking-widest text-cyan-400">{t('listSched.builder.preview')}</p>
            <div className="mt-2 min-h-0 flex-1 overflow-auto bg-zinc-200 p-4 text-zinc-900">
              {def.columns.length === 0 ? <p className="m-0 text-sm text-zinc-500">{t('listSched.builder.noColumns')}</p> : <ListSchedulePreview schedule={previewOf} zoom={2} />}
            </div>
          </section>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
