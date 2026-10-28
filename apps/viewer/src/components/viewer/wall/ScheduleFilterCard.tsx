/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The viewport card's filter for a joinery schedule (#186, section 3): keep only the elements of some IFC classes or predefined types, or whose
 * properties pass tests (`IsExternal` is true, `FireRating` has a value). For a sub-report it edits the part's own filter; for a whole schedule,
 * the filter of its content, which scopes what it lists (the parts are cut from that). The rule is the engine's (`schedule-filter.ts`), so the
 * sheet, the exports and the duplicate and gap check keep the same elements.
 */

import { useState } from 'react';
import { PROPERTY_OPS, textOwner, type PropertyOp, type PropertyTest, type SubReportFilter } from '@bimvoice/ifcsheet';
import { useTranslation, type TranslationKey } from '@/i18n';
import { setScheduleFilter } from '@/joinery/schedule-content-actions';
import { setSubReportFilter, toggled } from '@/joinery/schedules';
import { useProjectStore } from '@/project/project-store';
import { isJoinerySchedule } from '@/project/schedule-fit';
import type { ProjectSchedule } from '@/project/types';
import { useParentRows } from './SubReportChecks';
import { WALL_FIELD, WALL_PILL } from './wall-type';
import { CardSection } from './CardSection';
import { filterActive, filterSummary, say } from './card-section-summary';

/** A large toggle, pressed while its value is kept. */
function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button" aria-pressed={on} onClick={onClick}
      className="rounded-xl border border-sky-300/30 px-3 py-1.5 text-left text-sm text-sky-100 hover:border-sky-300/70 aria-pressed:border-sky-300 aria-pressed:bg-sky-400/25 aria-pressed:text-white"
    >
      {label}
    </button>
  );
}

/** The card's filter section where the schedule has a filter of its own: a part's, or a whole joinery schedule's (not a part's inherited content). */
export function ScheduleFilterSection({ schedule: given }: { schedule: ProjectSchedule }) {
  const schedules = useProjectStore((s) => s.schedules ?? []);
  // The store's schedule, so the section follows its own edits whichever copy the caller holds.
  const schedule = schedules.find((s) => s.id === given.id) ?? given;
  if (schedule.sub) return <ScheduleFilterCard schedule={schedule} filter={schedule.sub.filter} />;
  if (!isJoinerySchedule(schedule) || textOwner(schedules, schedule)?.id !== schedule.id) return null;
  return <ScheduleFilterCard schedule={schedule} filter={schedule.content?.filter} />;
}

function ScheduleFilterCard({ schedule, filter }: { schedule: ProjectSchedule; filter: SubReportFilter | undefined }) {
  const { t } = useTranslation();
  const whole = useParentRows(schedule.kind);
  const [draft, setDraft] = useState<{ pset: string; name: string; op: PropertyOp; value: string }>({ pset: '', name: '', op: 'equals', value: '' });
  const occurrences = whole.entries.flatMap((e) => e.occurrences);
  // What the model has to choose from; a value the filter names that the model no longer has stays listed, so it can be turned off.
  const options = (named: readonly string[] | undefined, found: Iterable<string | null | undefined>): string[] => [...new Set([...(named ?? []), ...[...found].filter((v): v is string => !!v)])].sort();
  const classes = options(filter?.classes, occurrences.map((o) => o.ifcClass));
  const predefined = options(filter?.predefined, occurrences.map((o) => o.predefinedType));
  const tests = filter?.properties ?? [];
  const set = (patch: { [K in keyof SubReportFilter]?: SubReportFilter[K] | undefined }) => (schedule.sub ? setSubReportFilter(schedule.id, patch) : void setScheduleFilter(schedule.id, patch));
  const opLabel = (op: PropertyOp) => t(`wall.filter.op.${op}` as TranslationKey);
  const active = filterActive(filter);
  const summary = filterSummary(filter, opLabel, t);
  const canAdd = draft.name.trim() !== '' && (draft.op === 'present' || draft.value.trim() !== '');
  const add = () => {
    if (!canAdd) return;
    const test: PropertyTest = { name: draft.name.trim(), op: draft.op, ...(draft.pset.trim() ? { pset: draft.pset.trim() } : {}), ...(draft.op === 'present' ? {} : { value: draft.value.trim() }) };
    set({ properties: [...tests, test] });
    setDraft({ ...draft, name: '', value: '' });
  };

  return (
    <CardSection id="filter" title={t('wall.filter.title')} summary={summary.text} defaultOpen={summary.changed}>
      <p className="m-0 mt-1 text-xs text-sky-200">{schedule.sub ? t('wall.filter.hint') : t('wall.filter.scope')}</p>

      {classes.length > 0 ? (
        <fieldset className="m-0 mt-3 border-0 p-0">
          <legend className="p-0 text-xs text-sky-200">{t('wall.filter.classes')}</legend>
          <div className="mt-1 grid grid-cols-2 gap-1.5">
            {classes.map((c) => <Toggle key={c} label={c} on={!filter?.classes || filter.classes.includes(c)} onClick={() => set({ classes: toggled(filter?.classes, c, classes) })} />)}
          </div>
        </fieldset>
      ) : null}

      {predefined.length > 0 ? (
        <fieldset className="m-0 mt-3 border-0 p-0">
          <legend className="p-0 text-xs text-sky-200">{t('wall.filter.predefined')}</legend>
          <div className="mt-1 grid grid-cols-2 gap-1.5">
            {predefined.map((p) => <Toggle key={p} label={p} on={!filter?.predefined || filter.predefined.includes(p)} onClick={() => set({ predefined: toggled(filter?.predefined, p, predefined) })} />)}
          </div>
        </fieldset>
      ) : null}

      <fieldset className="m-0 mt-3 border-0 p-0">
        <legend className="p-0 text-xs text-sky-200">{t('wall.filter.properties')}</legend>
        {tests.length === 0 ? <p className="m-0 mt-1 text-xs text-sky-200">{t('wall.filter.noTests')}</p> : (
          <ul className="m-0 mt-1 list-none p-0">
            {tests.map((test, i) => (
              <li key={`${test.pset ?? ''}.${test.name}.${test.op}.${test.value ?? ''}`} className="flex items-center gap-2 py-0.5 text-sm text-sky-100">
                <span className="min-w-0 flex-1 truncate">{say(test, opLabel(test.op))}</span>
                <button
                  type="button" className={WALL_PILL} aria-label={t('wall.filter.remove', { test: say(test, opLabel(test.op)) })}
                  onClick={() => set({ properties: tests.filter((_, j) => j !== i) })}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="block text-xs text-sky-200">
            {t('wall.filter.propName')}
            <input className={WALL_FIELD} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          </label>
          <label className="block text-xs text-sky-200">
            {t('wall.filter.propSet')}
            <input className={WALL_FIELD} value={draft.pset} onChange={(e) => setDraft({ ...draft, pset: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          </label>
          <label className="block text-xs text-sky-200">
            {t('wall.filter.op')}
            <select className={WALL_FIELD} value={draft.op} onChange={(e) => setDraft({ ...draft, op: e.target.value as PropertyOp })}>
              {PROPERTY_OPS.map((op) => <option key={op} value={op}>{opLabel(op)}</option>)}
            </select>
          </label>
          <label className="block text-xs text-sky-200">
            {t('wall.filter.propValue')}
            <input className={WALL_FIELD} value={draft.value} disabled={draft.op === 'present'} onChange={(e) => setDraft({ ...draft, value: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          </label>
        </div>
        <div className="mt-2 flex gap-2">
          <button type="button" className={WALL_PILL} disabled={!canAdd} onClick={add}>{t('wall.filter.add')}</button>
          <button type="button" className={WALL_PILL} disabled={!active} onClick={() => set({ classes: undefined, predefined: undefined, properties: undefined })}>{t('wall.filter.reset')}</button>
        </div>
      </fieldset>
    </CardSection>
  );
}
