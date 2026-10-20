/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The project's sheet numbering in the drawer: the pattern per group, a
 * preview of what every sheet would be numbered (old to new), and the two
 * ways to take it: renumber all, or only for the sheets made from now on.
 */

import { useMemo, useState } from 'react';
import { useTranslation, type TranslationKey } from '@/i18n';
import { NUMBER_GROUPS, numberAt, SCHEME_PRESETS, type OverrideMode } from '@/project/numbering';
import { numberingScheme, useProjectStore } from '@/project/project-store';
import { issuedAmong, previewRenumber, renumberAll, setSchemeForNewSheets } from '@/project/sheet-renumber';
import type { GroupPattern, NumberGroup, NumberingScheme } from '@/project/types';

const GROUP_LABELS: Record<NumberGroup, TranslationKey> = {
  plans: 'wall.group.plans', elevations: 'wall.group.elevations', sections: 'wall.group.sections', interiors: 'wall.group.interiors', details: 'wall.group.drafting', schedules: 'wall.group.schedules', other: 'wall.group.other',
};

const field = 'mt-1 w-full rounded-md border border-sky-300/30 bg-[#061a36] px-2 py-1 text-sm text-white';
const quiet = 'rounded-full border border-sky-300/30 px-3 py-1 text-xs text-sky-100 hover:border-sky-300/70 disabled:opacity-40';

/** `scheme` with `patch` applied to every group's pattern. */
function withAll(scheme: NumberingScheme, patch: Partial<GroupPattern>): NumberingScheme {
  return { ...scheme, groups: Object.fromEntries(NUMBER_GROUPS.map((g) => [g, { ...scheme.groups[g], ...patch }])) as Record<NumberGroup, GroupPattern> };
}

function Num({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (n: number) => void }) {
  return (
    <label className="block text-xs text-sky-200">
      {label}
      <input data-owns-keys type="number" min={min} className={field} value={value} onChange={(e) => { const n = Math.floor(Number(e.target.value)); if (Number.isFinite(n) && n >= min) onChange(n); }} />
    </label>
  );
}

function Text({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs text-sky-200">
      {label}
      <input data-owns-keys className={field} maxLength={8} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function SheetNumberingForm() {
  const { t } = useTranslation();
  const saved = useProjectStore((s) => s.sheetNumbering);
  const sheets = useProjectStore((s) => s.sheets);
  const [draft, setDraft] = useState<NumberingScheme>(() => numberingScheme({ sheetNumbering: saved }));
  const [overrides, setOverrides] = useState<OverrideMode>('keep');
  const [applied, setApplied] = useState<number | null>(null);
  const rows = useMemo(() => previewRenumber(draft, overrides), [draft, overrides, sheets]);
  const changing = rows.filter((r) => r.from !== r.to);
  const first = draft.groups.plans;
  const edit = (next: NumberingScheme): void => { setDraft(next); setApplied(null); };
  const setGroup = (g: NumberGroup, patch: Partial<GroupPattern>): void => edit({ ...draft, groups: { ...draft.groups, [g]: { ...draft.groups[g], ...patch } } });

  return (
    <div data-owns-keys>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" className={quiet} onClick={() => edit(SCHEME_PRESETS.default)}>{t('wall.num.presetDefault')}</button>
        <button type="button" className={quiet} onClick={() => edit(SCHEME_PRESETS.sequential)}>{t('wall.num.presetSequential')}</button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Text label={t('wall.num.discipline')} value={draft.discipline} onChange={(discipline) => edit({ ...draft, discipline })} />
        <Text label={t('wall.num.separator')} value={first.separator} onChange={(separator) => edit(withAll(draft, { separator }))} />
        <Num label={t('wall.num.digits')} value={first.digits} min={1} onChange={(digits) => edit(withAll(draft, { digits: Math.min(digits, 8) }))} />
        <Num label={t('wall.num.step')} value={first.step} min={1} onChange={(step) => edit(withAll(draft, { step }))} />
      </div>
      <label className="mt-2 flex items-center gap-2 text-xs text-sky-200">
        <input data-owns-keys type="checkbox" checked={draft.continuous} onChange={(e) => edit({ ...draft, continuous: e.target.checked })} />
        {t('wall.num.continuous')}
      </label>
      {NUMBER_GROUPS.filter((g) => !draft.continuous || g === 'plans').map((g) => (
        <div key={g} className="mt-2 grid grid-cols-[1fr_1fr_1fr] items-end gap-2">
          <span className="pb-1.5 text-xs text-sky-100">{t(draft.continuous ? 'wall.num.wholeSet' : GROUP_LABELS[g])}</span>
          <Text label={t('wall.num.prefix')} value={draft.groups[g].prefix} onChange={(prefix) => setGroup(g, { prefix })} />
          <Num label={t('wall.num.start')} value={draft.groups[g].start} min={0} onChange={(start) => setGroup(g, { start })} />
        </div>
      ))}
      <p className="m-0 mt-2 text-xs text-sky-200">{t('wall.num.example', { example: numberAt(draft, 'plans', 0) })}</p>
      <label className="mt-2 flex items-center gap-2 text-xs text-sky-200">
        <input data-owns-keys type="checkbox" checked={overrides === 'renumber'} onChange={(e) => { setOverrides(e.target.checked ? 'renumber' : 'keep'); setApplied(null); }} />
        {t('wall.num.overridesToo')}
      </label>
      <h4 className="m-0 mt-3 text-xs font-medium text-sky-100">{t('wall.num.preview', { count: changing.length })}</h4>
      <ul className="m-0 mt-1 max-h-40 list-none overflow-y-auto p-0 text-xs text-sky-100">
        {changing.map((r) => <li key={r.id} className="tabular-nums">{r.from} → <span className="font-semibold text-white">{r.to}</span></li>)}
        {rows.filter((r) => r.kept).map((r) => <li key={r.id} className="tabular-nums text-sky-300">{r.from} {t('wall.num.kept')}</li>)}
      </ul>
      {issuedAmong(changing) > 0 ? <output className="m-0 mt-1 block text-xs text-amber-300">{t('wall.num.issuedNote', { count: issuedAmong(changing) })}</output> : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button type="button" className={quiet} disabled={changing.length === 0} onClick={() => setApplied(renumberAll(draft, overrides))}>{t('wall.num.apply')}</button>
        <button type="button" className={quiet} onClick={() => setSchemeForNewSheets(draft)}>{t('wall.num.forNew')}</button>
      </div>
      {applied !== null ? <output className="m-0 mt-1 block text-xs text-sky-200">{t('wall.num.done', { count: applied })}</output> : null}
    </div>
  );
}
