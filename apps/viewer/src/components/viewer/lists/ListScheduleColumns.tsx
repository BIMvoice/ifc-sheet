/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The builder's columns (#78): any attribute, property or quantity of the models, in the order they print, and which of them group and sum. */

import type { ListScheduleColumn } from '@bimvoice/ifcsheet';
import { useTranslation } from '@/i18n';
import { WALL_FIELD, WALL_LABEL, WALL_PILL } from '../wall/wall-type';
import { columnIdOf, type ListDraft, type ModelFacts } from './list-schedule-draft';

const nameOf = (c: ListScheduleColumn): string => c.label ?? (c.psetName ? `${c.psetName}.${c.propertyName}` : c.propertyName);

/** A column to add, encoded for a select's value. */
const encode = (source: ListScheduleColumn['source'], pset: string | undefined, name: string): string => JSON.stringify([source, pset ?? null, name]);

export function ListScheduleColumns({ draft, facts, set }: { draft: ListDraft; facts: ModelFacts; set: (patch: Partial<ListDraft>) => void }) {
  const { t } = useTranslation();
  const taken = new Set(draft.columns.map((c) => c.id));
  const add = (value: string): void => {
    const [source, pset, name] = JSON.parse(value) as [ListScheduleColumn['source'], string | null, string];
    const id = columnIdOf(source, pset ?? undefined, name);
    if (taken.has(id)) return;
    // The office classification's headings are the app's words, not the property names `Code` and `Title` (#351).
    const label = source === 'officeClassification' ? t(name === 'Title' ? 'class.list.title' : 'class.list.code') : undefined;
    set({ columns: [...draft.columns, { id, source, ...(pset ? { psetName: pset } : {}), propertyName: name, ...(label ? { label } : {}) }] });
  };
  const move = (i: number, by: -1 | 1): void => {
    const columns = [...draft.columns];
    [columns[i], columns[i + by]] = [columns[i + by], columns[i]];
    set({ columns });
  };
  const remove = (id: string): void => set({ columns: draft.columns.filter((c) => c.id !== id), groupBy: draft.groupBy.filter((g) => g !== id), sum: draft.sum.filter((g) => g !== id) });
  const flip = (list: readonly string[], id: string): string[] => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const option = (source: ListScheduleColumn['source'], pset: string | undefined, name: string, text = name) => (
    <option key={encode(source, pset, name)} value={encode(source, pset, name)} disabled={taken.has(columnIdOf(source, pset, name))}>{text}</option>
  );
  return (
    <fieldset className="m-0 mt-4 border-0 p-0">
      <legend className="p-0 text-xs text-sky-200">{t('listSched.builder.columns')}</legend>
      {draft.columns.length === 0 ? <p className="m-0 mt-1 text-xs text-amber-200">{t('listSched.builder.noColumns')}</p> : (
        <table className="mt-1 w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-2xs uppercase tracking-widest text-sky-300">
              <th className="py-1 font-medium"><span className="sr-only">{t('listSched.builder.columns')}</span></th>
              <th className="px-2 py-1 font-medium">{t('listSched.builder.group')}</th>
              <th className="px-2 py-1 font-medium">{t('listSched.builder.sum')}</th>
              <th className="py-1"><span className="sr-only">{t('listSched.builder.actions')}</span></th>
            </tr>
          </thead>
          <tbody>
            {draft.columns.map((c, i) => (
              <tr key={c.id} className="border-t border-sky-300/10">
                <td className="min-w-[9rem] break-words py-1 pr-2 text-sky-100">{nameOf(c)}</td>
                <td className="px-2"><input type="checkbox" aria-label={`${t('listSched.builder.group')}: ${nameOf(c)}`} checked={draft.groupBy.includes(c.id)} onChange={() => set({ groupBy: flip(draft.groupBy, c.id), ...(draft.groupBy.includes(c.id) && draft.groupBy.length === 1 ? { sum: [] } : {}) })} /></td>
                <td className="px-2"><input type="checkbox" aria-label={`${t('listSched.builder.sum')}: ${nameOf(c)}`} disabled={draft.groupBy.length === 0} checked={draft.sum.includes(c.id)} onChange={() => set({ sum: flip(draft.sum, c.id) })} /></td>
                <td className="whitespace-nowrap py-1 text-right">
                  <button type="button" className={WALL_PILL} disabled={i === 0} aria-label={t('listSched.builder.up', { name: nameOf(c) })} onClick={() => move(i, -1)}>↑</button>{' '}
                  <button type="button" className={WALL_PILL} disabled={i === draft.columns.length - 1} aria-label={t('listSched.builder.down', { name: nameOf(c) })} onClick={() => move(i, 1)}>↓</button>{' '}
                  <button type="button" className={WALL_PILL} aria-label={t('listSched.builder.remove', { name: nameOf(c) })} onClick={() => remove(c.id)}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <label className={`${WALL_LABEL} mt-2`}>
        {t('listSched.builder.addColumn')}
        <select className={WALL_FIELD} value="" onChange={(e) => { if (e.target.value) add(e.target.value); }}>
          <option value="">{t('listSched.builder.pick')}</option>
          <optgroup label={t('listSched.builder.attributes')}>{facts.attributes.map((a) => option('attribute', undefined, a))}</optgroup>
          <optgroup label={t('class.list.group')}>{option('officeClassification', undefined, 'Code', t('class.list.code'))}{option('officeClassification', undefined, 'Title', t('class.list.title'))}</optgroup>
          {[...facts.quantities].map(([set, names]) => <optgroup key={`q:${set}`} label={t('listSched.builder.quantities', { set })}>{names.map((n) => option('quantity', set, n))}</optgroup>)}
          {[...facts.properties].map(([set, names]) => <optgroup key={`p:${set}`} label={t('listSched.builder.properties', { set })}>{names.map((n) => option('property', set, n))}</optgroup>)}
        </select>
      </label>
      <p className="m-0 mt-2 text-xs text-sky-200">{t('listSched.builder.groupHint')}</p>
      <label className="mt-2 flex items-center gap-2 text-xs text-sky-100">
        <input type="checkbox" checked={draft.totals} disabled={draft.groupBy.length === 0} onChange={(e) => set({ totals: e.target.checked })} />
        {t('listSched.builder.totals')}
      </label>
    </fieldset>
  );
}
