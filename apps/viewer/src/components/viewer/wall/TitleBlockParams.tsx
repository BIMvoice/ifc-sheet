/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The title block's parameters on the Wall (#143). In the project drawer: the
 * list of name and value, which the user can add to, rename and delete, with
 * the built-in names listed read-only. On a sheet's own card: that sheet's
 * value for each, which it keeps until put back to the project's.
 */

import { useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation, type TranslationKey } from '@/i18n';
import { useProjectStore } from '@/project/project-store';
import { addTitleBlockParam, clearSheetParam, deleteTitleBlockParam, renameTitleBlockParam, setSheetParam, setTitleBlockParamValue } from '@/project/title-block-param-actions';
import { BUILTIN_PARAMS, type ParamNameProblem } from '@/project/title-block-params';
import type { ProjectSheet } from '@/project/types';

const field = 'mt-1 w-full rounded-md border border-sky-300/30 bg-[#061a36] px-2 py-1.5 text-sm text-white';
const quiet = 'rounded-full border border-sky-300/30 px-3 py-1 text-xs text-sky-100 hover:border-sky-300/70';
const PROBLEMS: Record<ParamNameProblem, TranslationKey> = {
  empty: 'tbparams.problem.empty', invalid: 'tbparams.problem.invalid', builtin: 'tbparams.problem.builtin', duplicate: 'tbparams.problem.duplicate',
};

/** `{Name}` as text uses it. */
const token = (name: string): string => `{${name}}`;

function ParamRow({ name, value }: { name: string; value: string }) {
  const { t } = useTranslation();
  const [problem, setProblem] = useState<ParamNameProblem | null>(null);
  return (
    <li className="mt-2 flex items-start gap-1.5">
      <div className="min-w-0 flex-1">
        <input
          // A rename refused is shown, and what the parameter is called stays what it was.
          key={`n:${name}`}
          aria-label={t('tbparams.name')}
          aria-invalid={problem ? true : undefined}
          className={field}
          defaultValue={name}
          data-owns-keys
          onBlur={(e) => {
            const refused = renameTitleBlockParam(name, e.target.value);
            setProblem(refused);
            if (refused) e.target.value = name;
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
        {problem ? <p role="alert" className="m-0 mt-1 text-xs text-amber-300">{t(PROBLEMS[problem])}</p> : null}
      </div>
      <input
        key={`v:${name}:${value}`}
        aria-label={t('tbparams.value', { name })}
        className={`${field} min-w-0 flex-1`}
        defaultValue={value}
        data-owns-keys
        onBlur={(e) => { if (e.target.value !== value) setTitleBlockParamValue(name, e.target.value); }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      />
      <button type="button" aria-label={t('tbparams.delete', { name })} onClick={() => deleteTitleBlockParam(name)} className="mt-1 rounded p-1.5 text-sky-200 hover:bg-sky-400/20">
        <X className="size-3.5" />
      </button>
    </li>
  );
}

/** The project's list, in the drawer. */
export function ProjectParams() {
  const { t } = useTranslation();
  const params = useProjectStore((s) => s.titleBlockParams) ?? [];
  const add = (): void => {
    // A fresh name that is always valid, for the user to rename.
    const base = 'Parameter';
    let n = 1;
    while (addTitleBlockParam(n === 1 ? base : `${base}${n}`, '') === 'duplicate') n += 1;
  };
  return (
    <section aria-label={t('tbparams.title')} className="mt-4 border-t border-sky-300/10 pt-3">
      <h4 className="m-0 text-2xs font-medium uppercase tracking-[0.25em] text-cyan-400">{t('tbparams.title')}</h4>
      <p className="m-0 mt-2 text-xs leading-relaxed text-sky-200">{t('tbparams.hint', { token: token('Name') })}</p>
      <p className="m-0 mt-1 text-xs leading-relaxed text-sky-200/80">{t('tbparams.builtin', { names: BUILTIN_PARAMS.map(token).join(' ') })}</p>
      {params.length === 0 ? <p className="m-0 mt-2 text-xs text-sky-200/80">{t('tbparams.none')}</p> : null}
      <ul className="m-0 list-none p-0">{params.map((p) => <ParamRow key={p.name} name={p.name} value={p.value} />)}</ul>
      <button type="button" className={`${quiet} mt-2`} onClick={add}>{t('tbparams.add')}</button>
    </section>
  );
}

/** A sheet's own values, on its card. */
export function SheetParams({ sheet }: { sheet: ProjectSheet }) {
  const { t } = useTranslation();
  const params = useProjectStore((s) => s.titleBlockParams) ?? [];
  if (params.length === 0) return null;
  return (
    <section aria-label={t('tbparams.title')} className="mt-4 border-t border-sky-300/10 pt-3">
      <h4 className="m-0 text-2xs font-medium uppercase tracking-[0.25em] text-cyan-400">{t('tbparams.title')}</h4>
      <p className="m-0 mt-2 text-xs leading-relaxed text-sky-200">{t('tbparams.sheetHint')}</p>
      {params.map((p) => {
        const own = sheet.titleBlockParams?.[p.name];
        const shown = own ?? p.value;
        return (
          <div key={p.name} className="mt-2 text-sm text-sky-200">
            <label className="block">
              <span className="flex items-baseline gap-2">
                {token(p.name)}
                {own !== undefined ? <span className="text-2xs text-amber-300">{t('tbparams.ownValue')}</span> : null}
              </span>
              <input
                key={`${p.name}:${shown}`}
                className={field}
                defaultValue={shown}
                data-owns-keys
                onBlur={(e) => { if (e.target.value !== shown) setSheetParam(sheet.id, p.name, e.target.value); }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              />
            </label>
            {own !== undefined ? <button type="button" className={`${quiet} mt-1`} onClick={() => clearSheetParam(sheet.id, p.name)}>{t('tbparams.useProject')}</button> : null}
          </div>
        );
      })}
    </section>
  );
}
