/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The builder's choice of elements (#78), in the schedule filter's terms (#287): the IFC classes, the storeys and the property tests. The
 * rule is the engine's (`schedule-filter.ts`), the one a joinery schedule's card edits, so the same words mean the same elements.
 */

import { useState } from 'react';
import { PROPERTY_OPS, type PropertyOp, type PropertyTest } from '@bimvoice/ifcsheet';
import { useTranslation, type TranslationKey } from '@/i18n';
import { say } from '../wall/card-section-summary';
import { WALL_FIELD, WALL_PILL } from '../wall/wall-type';
import type { ListDraft, ModelFacts } from './list-schedule-draft';

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

const flip = (list: readonly string[], value: string): string[] => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

export function ListScheduleScope({ draft, facts, set }: { draft: ListDraft; facts: ModelFacts; set: (patch: Partial<ListDraft>) => void }) {
  const { t } = useTranslation();
  const [test, setTest] = useState<{ pset: string; name: string; op: PropertyOp; value: string }>({ pset: '', name: '', op: 'equals', value: '' });
  const opLabel = (op: PropertyOp) => t(`wall.filter.op.${op}` as TranslationKey);
  // A class or storey the draft names that the models no longer have stays listed, so it can be turned off.
  const classes = [...new Set([...facts.classes.keys(), ...draft.classes])].sort();
  const storeys = [...new Set([...facts.storeys, ...draft.levels])];
  const canAdd = test.name.trim() !== '' && (test.op === 'present' || test.value.trim() !== '');
  const add = () => {
    if (!canAdd) return;
    const next: PropertyTest = { name: test.name.trim(), op: test.op, ...(test.pset.trim() ? { pset: test.pset.trim() } : {}), ...(test.op === 'present' ? {} : { value: test.value.trim() }) };
    set({ tests: [...draft.tests, next] });
    setTest({ ...test, name: '', value: '' });
  };
  return (
    <>
      <fieldset className="m-0 mt-4 border-0 p-0">
        <legend className="p-0 text-xs text-sky-200">{t('listSched.builder.classes')}</legend>
        {classes.length === 0 ? <p className="m-0 mt-1 text-xs text-sky-200">{t('listSched.builder.noClasses')}</p> : (
          <div className="mt-1 grid grid-cols-3 gap-1.5">
            {classes.map((c) => <Toggle key={c} label={facts.classes.has(c) ? `${c} (${facts.classes.get(c)})` : c} on={draft.classes.includes(c)} onClick={() => set({ classes: flip(draft.classes, c) })} />)}
          </div>
        )}
        <p className="m-0 mt-1 text-xs text-sky-200">{t('listSched.builder.classesHint')}</p>
      </fieldset>
      {storeys.length > 1 ? (
        <fieldset className="m-0 mt-4 border-0 p-0">
          <legend className="p-0 text-xs text-sky-200">{t('listSched.builder.storeys')}</legend>
          <div className="mt-1 grid grid-cols-3 gap-1.5">{storeys.map((s) => <Toggle key={s} label={s} on={draft.levels.includes(s)} onClick={() => set({ levels: flip(draft.levels, s) })} />)}</div>
          <p className="m-0 mt-1 text-xs text-sky-200">{t('listSched.builder.storeysHint')}</p>
        </fieldset>
      ) : null}
      <fieldset className="m-0 mt-4 border-0 p-0">
        <legend className="p-0 text-xs text-sky-200">{t('wall.filter.properties')}</legend>
        {draft.tests.length === 0 ? <p className="m-0 mt-1 text-xs text-sky-200">{t('wall.filter.noTests')}</p> : (
          <ul className="m-0 mt-1 list-none p-0">
            {draft.tests.map((p, i) => (
              <li key={`${p.pset ?? ''}.${p.name}.${p.op}.${p.value ?? ''}`} className="flex items-center gap-2 py-0.5 text-sm text-sky-100">
                <span className="min-w-0 flex-1 truncate">{say(p, opLabel(p.op))}</span>
                <button type="button" className={WALL_PILL} aria-label={t('wall.filter.remove', { test: say(p, opLabel(p.op)) })} onClick={() => set({ tests: draft.tests.filter((_, j) => j !== i) })}>×</button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 grid grid-cols-4 gap-2">
          <label className="block text-xs text-sky-200">{t('wall.filter.propName')}<input className={WALL_FIELD} value={test.name} onChange={(e) => setTest({ ...test, name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} /></label>
          <label className="block text-xs text-sky-200">{t('wall.filter.propSet')}<input className={WALL_FIELD} value={test.pset} onChange={(e) => setTest({ ...test, pset: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} /></label>
          <label className="block text-xs text-sky-200">
            {t('wall.filter.op')}
            <select className={WALL_FIELD} value={test.op} onChange={(e) => setTest({ ...test, op: e.target.value as PropertyOp })}>{PROPERTY_OPS.map((op) => <option key={op} value={op}>{opLabel(op)}</option>)}</select>
          </label>
          <label className="block text-xs text-sky-200">{t('wall.filter.propValue')}<input className={WALL_FIELD} value={test.value} disabled={test.op === 'present'} onChange={(e) => setTest({ ...test, value: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} /></label>
        </div>
        <button type="button" className={`${WALL_PILL} mt-2`} disabled={!canAdd} onClick={add}>{t('wall.filter.add')}</button>
      </fieldset>
    </>
  );
}
