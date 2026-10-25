/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One article of the mapping table (#75): the office's code and description; which elements it picks (a type, a material, an IFC class, with the
 * schedule's property tests of #287 narrowing them); which declared quantity it takes, times a factor, plus waste; and the unit. Beside it, what that
 * gives on the loaded models, or in words why the article is refused (a quantity that is not the unit's).
 */

import { useState } from 'react';
import { BOQ_QUANTITIES, BOQ_UNITS, BOQ_UNIT_TEXT, PROPERTY_OPS, describeBoqProblem, unitDimension, type BoqArticle, type BoqLine, type BoqUnit, type PropertyOp, type PropertyTest, type SubReportFilter } from '@bimvoice/ifcsheet';
import { sheetNumber } from '@bimvoice/ifcsheet/names';
import { useTranslation, type TranslationKey } from '@/i18n';
import { useSheetLocale } from '@/project/units-and-numbers';
import { removeBoqArticle, setBoqUnit, updateBoqArticle } from '@/boq/boq-actions';
import { WALL_FIELD, WALL_LABEL, WALL_PILL } from '../wall/wall-type';
import { say as sayTest } from '../wall/card-section-summary';
import { NumberField, TextField } from './BoqFields';
import { useBoqSay } from './useBoq';

export interface BoqOptions { types: string[]; materials: string[]; classes: string[] }

/** The article's filter with `patch` applied; undefined when nothing is left of it. */
function withFilter(filter: SubReportFilter | undefined, patch: Partial<SubReportFilter>): SubReportFilter | undefined {
  const next: SubReportFilter = { ...filter, ...patch };
  for (const key of Object.keys(next) as (keyof SubReportFilter)[]) {
    const v = next[key];
    if (v === undefined || (Array.isArray(v) && v.length === 0)) delete next[key];
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function PropertyTests({ article }: { article: BoqArticle }) {
  const { t } = useTranslation();
  const tests = article.filter?.properties ?? [];
  const [draft, setDraft] = useState<{ name: string; op: PropertyOp; value: string }>({ name: '', op: 'equals', value: '' });
  const opLabel = (op: PropertyOp) => t(`wall.filter.op.${op}` as TranslationKey);
  const canAdd = draft.name.trim() !== '' && (draft.op === 'present' || draft.value.trim() !== '');
  const set = (properties: PropertyTest[]) => updateBoqArticle(article.id, { filter: withFilter(article.filter, { properties }) });
  const add = () => {
    if (!canAdd) return;
    set([...tests, { name: draft.name.trim(), op: draft.op, ...(draft.op === 'present' ? {} : { value: draft.value.trim() }) }]);
    setDraft({ ...draft, name: '', value: '' });
  };
  return (
    <details className="mt-2 text-xs text-sky-200" open={tests.length > 0}>
      <summary className="cursor-pointer">{t('boq.field.filter')}{tests.length > 0 ? ` (${tests.length})` : ''}</summary>
      <ul className="m-0 mt-1 list-none p-0">
        {tests.map((test, i) => (
          <li key={`${test.name}.${test.op}.${test.value ?? ''}`} className="flex items-center gap-2 py-0.5 text-sm text-sky-100">
            <span className="min-w-0 flex-1 truncate">{sayTest(test, opLabel(test.op))}</span>
            <button type="button" className={WALL_PILL} aria-label={t('wall.filter.remove', { test: sayTest(test, opLabel(test.op)) })} onClick={() => set(tests.filter((_, j) => j !== i))}>×</button>
          </li>
        ))}
      </ul>
      <div className="mt-1 grid grid-cols-[1fr_auto_1fr_auto] items-end gap-2">
        <label className={WALL_LABEL}>{t('wall.filter.propName')}<input className={WALL_FIELD} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} /></label>
        <label className={WALL_LABEL}>{t('wall.filter.op')}
          <select className={WALL_FIELD} value={draft.op} onChange={(e) => setDraft({ ...draft, op: e.target.value as PropertyOp })}>{PROPERTY_OPS.map((op) => <option key={op} value={op}>{opLabel(op)}</option>)}</select>
        </label>
        <label className={WALL_LABEL}>{t('wall.filter.propValue')}<input className={WALL_FIELD} value={draft.value} disabled={draft.op === 'present'} onChange={(e) => setDraft({ ...draft, value: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} /></label>
        <button type="button" className={`${WALL_PILL} mb-0.5`} disabled={!canAdd} onClick={add}>{t('wall.filter.add')}</button>
      </div>
    </details>
  );
}

/** What the article gives on the loaded models, or why it is refused. */
function Result({ line }: { line: BoqLine | undefined }) {
  const { t } = useTranslation();
  // The language with the project's "Units and numbers" (#88): the figures are written as every other sheet's are.
  const locale = useSheetLocale();
  const sayBoq = useBoqSay();
  if (!line) return null;
  const { article: a } = line;
  if (line.problem) return <p role="alert" className="m-0 text-sm text-red-300">{describeBoqProblem(line.problem, sayBoq)}</p>;
  return (
    <div className="text-sm">
      <p className="m-0 text-lg font-medium text-white">{line.total === null ? '–' : t('boq.result.total', { total: sheetNumber(locale, line.total), unit: BOQ_UNIT_TEXT[a.unit] })}</p>
      <p className="m-0 text-xs text-sky-200">
        {line.matched === 0 ? t('boq.result.none') : line.counted === 0 ? t('boq.result.noQuantity', { matched: line.matched, quantity: a.quantity }) : t('boq.result.counts', { matched: line.matched, counted: line.counted })}
      </p>
      {line.missing.length > 0 && line.counted > 0 ? (
        <details className="text-xs text-amber-200">
          <summary className="cursor-pointer">{t('boq.result.missing', { count: line.missing.length, quantity: a.quantity })}</summary>
          <ul className="m-0 mt-1 max-h-24 list-none overflow-y-auto p-0">{line.missing.slice(0, 50).map((m) => <li key={`${m.modelId}:${m.expressId}`} className="truncate">{m.name || m.globalId} ({m.ifcClass})</li>)}</ul>
        </details>
      ) : null}
    </div>
  );
}

export function BoqArticleRow({ article: a, n, line, options }: { article: BoqArticle; n: number; line: BoqLine | undefined; options: BoqOptions }) {
  const { t } = useTranslation();
  const quantities = BOQ_QUANTITIES[unitDimension(a.unit)];
  const quantityList = quantities.includes(a.quantity) ? quantities : [a.quantity, ...quantities];
  return (
    <li className="rounded-xl border border-sky-300/20 bg-[#0b2348]/70 p-4" data-article={a.id}>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_14rem]">
        <div>
          <p className="m-0 text-2xs font-medium uppercase tracking-widest text-cyan-400">{t('boq.editor.article', { n })}</p>
          <div className="mt-1 grid grid-cols-[9rem_minmax(0,1fr)_5.5rem] gap-2">
            <TextField label={t('boq.field.code')} value={a.code} onCommit={(code) => updateBoqArticle(a.id, { code })} />
            <TextField label={t('boq.field.description')} value={a.description} onCommit={(description) => updateBoqArticle(a.id, { description })} />
            <label className={WALL_LABEL}>
              {t('boq.field.unit')}
              <select className={WALL_FIELD} value={a.unit} onChange={(e) => setBoqUnit(a.id, e.target.value as BoqUnit)}>{BOQ_UNITS.map((u) => <option key={u} value={u}>{BOQ_UNIT_TEXT[u]}</option>)}</select>
            </label>
          </div>
          <p className="m-0 mt-3 text-xs text-sky-200">{t('boq.field.picks')}</p>
          <div className="grid grid-cols-3 gap-2">
            <TextField label={t('boq.field.type')} value={a.typeName ?? ''} list="boq-types" placeholder={t('boq.field.any')} onCommit={(v) => updateBoqArticle(a.id, { typeName: v.trim() || undefined })} />
            <TextField label={t('boq.field.material')} value={a.material ?? ''} list="boq-materials" placeholder={t('boq.field.any')} onCommit={(v) => updateBoqArticle(a.id, { material: v.trim() || undefined })} />
            <TextField
              label={t('boq.field.class')} value={a.filter?.classes?.[0] ?? ''} list="boq-classes" placeholder={t('boq.field.any')}
              onCommit={(v) => updateBoqArticle(a.id, { filter: withFilter(a.filter, { classes: v.trim() ? [v.trim()] : undefined }) })}
            />
          </div>
          <p className="m-0 mt-3 text-xs text-sky-200">{t('boq.field.formula')}</p>
          <div className="grid grid-cols-[minmax(0,1fr)_6rem_6rem] gap-2">
            <label className={WALL_LABEL}>
              {t('boq.field.quantity')}
              <select className={WALL_FIELD} value={a.quantity} onChange={(e) => updateBoqArticle(a.id, { quantity: e.target.value })}>{quantityList.map((q) => <option key={q} value={q}>{q}</option>)}</select>
            </label>
            <NumberField label={t('boq.field.factor')} value={a.factor} fallback={1} onCommit={(factor) => updateBoqArticle(a.id, { factor: factor ?? 1 })} />
            <NumberField label={t('boq.field.waste')} value={a.waste} fallback={0} onCommit={(waste) => updateBoqArticle(a.id, { waste: waste || undefined })} />
          </div>
          <PropertyTests article={a} />
        </div>
        <div className="flex flex-col justify-between gap-3">
          <Result line={line} />
          <button type="button" className={`${WALL_PILL} self-start`} aria-label={t('boq.editor.remove', { code: a.code || t('boq.editor.unnamed') })} onClick={() => removeBoqArticle(a.id)}>×</button>
        </div>
      </div>
      <datalist id="boq-types">{options.types.map((v) => <option key={v} value={v}>{v}</option>)}</datalist>
      <datalist id="boq-materials">{options.materials.map((v) => <option key={v} value={v}>{v}</option>)}</datalist>
      <datalist id="boq-classes">{options.classes.map((v) => <option key={v} value={v}>{v}</option>)}</datalist>
    </li>
  );
}
