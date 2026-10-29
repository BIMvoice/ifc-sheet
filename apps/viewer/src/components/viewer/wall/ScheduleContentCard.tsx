/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The viewport card's part for what a joinery schedule shows (#186, section 3): which rows, in which order, how the type columns are
 * sorted and how types and elements are numbered. The choice is kept on the schedule (`content`) and applied by the engine, so the
 * sheet, the exports and the checks print the same table. A sub-report prints its parent's choice and edits it there. Changing the
 * numbering moves the tags of the elements the schedule had numbered, so the plan tags say what the schedule says.
 */

import { useEffect, useMemo, useState } from 'react';
import { MAX_START, modelRowLabel, orderedRows, SORTS, symbolsShown, textOwner, type SortBy } from '@bimvoice/ifcsheet';
import { useTranslation, type TranslationKey } from '@/i18n';
import { useProjectStore } from '@/project/project-store';
import { isJoinerySchedule } from '@/project/schedule-fit';
import { addModelRow, moveRow, resetContent, setNumbering, setRowShown, setSort, setSymbolShown } from '@/joinery/schedule-content-actions';
import type { ProjectSchedule } from '@/project/types';
import { toast } from '@/components/ui/toast';
import { WALL_FIELD, WALL_PILL } from './wall-type';
import { CardSection } from './CardSection';
import { useViewerStore } from '@/store';
import { scheduleData, type ScheduleKind } from '@/joinery/schedule-data';
import { scheduleDataOf } from '@/joinery/schedule-split';
import { joineryModelFacts } from '@/joinery/joinery-model-facts';
import { AddColumnPicker } from '../lists/ListScheduleColumns';
import { contentSummary } from './card-section-summary';

export const ROW_LABELS: Record<string, TranslationKey> = {
  name: 'schedule.row.name', size: 'schedule.row.size', operation: 'schedule.row.operation', sill: 'schedule.row.sill',
  levels: 'wall.content.row.levels', total: 'schedule.row.total', u: 'schedule.row.uValue', fire: 'schedule.row.fire',
};

/** A whole number kept as typed until the field is left (or Enter); an empty field is the default. */
function NumberField({ value, label, fallback, disabled, onCommit }: { value: number | undefined; label: string; fallback: number; disabled?: boolean; onCommit: (n: number | undefined) => void }) {
  const [draft, setDraft] = useState(value === undefined ? '' : String(value));
  useEffect(() => setDraft(value === undefined ? '' : String(value)), [value]);
  const commit = () => {
    const n = draft.trim() === '' ? undefined : Number(draft);
    const ok = n === undefined || (Number.isInteger(n) && n >= 0 && n <= MAX_START);
    if (!ok) { setDraft(value === undefined ? '' : String(value)); return; }
    if (n !== value) onCommit(n);
  };
  return (
    <input
      type="number" aria-label={label} className={WALL_FIELD} value={draft} placeholder={String(fallback)} min={0} max={MAX_START} step={1} disabled={disabled}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
}

export function ScheduleContentCard({ schedule }: { schedule: ProjectSchedule }) {
  const { t } = useTranslation();
  const schedules = useProjectStore((s) => s.schedules ?? []);
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  const models = useViewerStore((s) => s.models);
  const joinery = isJoinerySchedule(schedule);
  // What the schedule's elements and types carry in the models, for the picker (#446); mutationVersion / models: what the read depends on.
  // Cut by the schedule's own filter (`scheduleDataOf`), so a sub-report or a split schedule offers what ITS elements carry, not the building's.
  const found = useMemo(() => (joinery ? joineryModelFacts(scheduleDataOf(schedule, () => scheduleData(schedule.kind as ScheduleKind), schedules)) : null), [joinery, schedule, schedules, mutationVersion, models]);
  if (!joinery) return null;
  const owner = textOwner(schedules, schedule);
  if (!owner) return null;
  const inherited = owner.id !== schedule.id ? owner : null;
  const content = owner.content;
  const typed = owner.textRows ?? [];
  const rows = orderedRows(content, typed.map((r) => r.id));
  const label = (id: string): string => {
    const key = ROW_LABELS[id];
    const own = content?.properties?.find((r) => r.id === id);
    return key ? t(key) : own ? modelRowLabel(own, content?.properties ?? []) : typed.find((r) => `text:${r.id}` === id)?.label ?? id;
  };
  const sequence = content?.numbering?.marks === 'sequence';
  // The tags of elements the schedule had numbered follow a change of marks; where they cannot (Edit mode is off), say so.
  const report = (out: { errors: string[] }) => { if (out.errors.length > 0) toast.error(t('wall.content.tagsFailed', { reason: out.errors.join('; ') })); };
  const summary = contentSummary(content, typed.map((r) => r.id), t);
  return (
    <CardSection id="content" title={t('wall.content.title')} summary={summary.text} defaultOpen={summary.changed}>
      <p className="m-0 mt-1 text-xs text-sky-200">{inherited ? t('wall.content.inherited', { name: inherited.name }) : t('wall.content.hint')}</p>

      <fieldset className="m-0 mt-3 border-0 p-0">
        <legend className="p-0 text-xs text-sky-200">{t('wall.content.rows')}</legend>
        <ul className="m-0 mt-1 list-none p-0">
          {rows.map((r, i) => (
            <li key={r.id} className="flex items-center gap-2 py-0.5 text-sm text-sky-100">
              <label className="flex min-w-0 flex-1 items-center gap-2">
                <input type="checkbox" checked={r.shown} onChange={() => setRowShown(schedule.id, r.id, !r.shown)} />
                <span className="truncate">{label(r.id)}</span>
              </label>
              <button type="button" className={WALL_PILL} aria-label={t('wall.content.up', { row: label(r.id) })} disabled={i === 0} onClick={() => moveRow(schedule.id, r.id, -1)}>↑</button>
              <button type="button" className={WALL_PILL} aria-label={t('wall.content.down', { row: label(r.id) })} disabled={i === rows.length - 1} onClick={() => moveRow(schedule.id, r.id, 1)}>↓</button>
              <button type="button" className={WALL_PILL} disabled={!r.shown} aria-label={t('joineryCell.removeColumn', { name: label(r.id) })} onClick={() => setRowShown(schedule.id, r.id, false)}>×</button>
            </li>
          ))}
        </ul>
        {/* The same choice the list schedules offer (#446): the columns the table does not print, to add back. */}
        <AddColumnPicker
          facts={{ classes: new Map(), storeys: [], properties: found?.properties ?? new Map(), quantities: found?.quantities ?? new Map(), attributes: rows.filter((r) => !r.shown).map((r) => r.id) }}
          taken={new Set((content?.properties ?? []).map((r) => r.id))} omitClassification label={t('joineryCell.addColumn')} labelOf={label}
          onAdd={(column) => {
            if (column.source === 'attribute') setRowShown(schedule.id, column.propertyName, true);
            else if (column.source === 'property' || column.source === 'quantity') { if (!addModelRow(schedule.id, { source: column.source, psetName: column.psetName, propertyName: column.propertyName })) toast.error(t('joineryCell.tooManyRows')); }
          }}
        />
      </fieldset>

      <fieldset className="m-0 mt-3 border-0 p-0">
        <legend className="p-0 text-xs text-sky-200">{t('wall.content.symbols')}</legend>
        <div className="mt-1 grid grid-cols-2 gap-1.5">
          {(['elevation', 'plan'] as const).map((symbol) => (
            <label key={symbol} className="flex items-center gap-2 text-sm text-sky-100">
              <input type="checkbox" checked={symbolsShown(content)[symbol]} onChange={(e) => setSymbolShown(schedule.id, symbol, e.target.checked)} />
              {t(`wall.content.symbol.${symbol}` as TranslationKey)}
            </label>
          ))}
        </div>
        <p className="m-0 mt-1 text-xs text-sky-200">{t('wall.content.symbols.hint')}</p>
      </fieldset>

      <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-2">
        <label className="block text-xs text-sky-200">
          {t('wall.content.sort')}
          <select
            className={WALL_FIELD} value={content?.sort?.by ?? ''}
            onChange={(e) => report(setSort(schedule.id, e.target.value ? { by: e.target.value as SortBy, ...(content?.sort?.descending ? { descending: true } : {}) } : undefined))}
          >
            <option value="">{t('wall.content.sort.model')}</option>
            {SORTS.map((by) => <option key={by} value={by}>{t(`wall.content.sort.${by}` as TranslationKey)}</option>)}
          </select>
        </label>
        <label className="mb-1.5 flex items-center gap-2 text-xs text-sky-200">
          <input
            type="checkbox" disabled={!content?.sort} checked={content?.sort?.descending === true}
            onChange={(e) => content?.sort && report(setSort(schedule.id, { by: content.sort.by, ...(e.target.checked ? { descending: true } : {}) }))}
          />
          {t('wall.content.reverse')}
        </label>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="col-span-2 block text-xs text-sky-200">
          {t('wall.content.marks')}
          <select className={WALL_FIELD} value={sequence ? 'sequence' : 'catalogue'} onChange={(e) => report(setNumbering(schedule.id, { marks: e.target.value === 'sequence' ? 'sequence' : undefined }))}>
            <option value="catalogue">{t('wall.content.marks.catalogue')}</option>
            <option value="sequence">{t('wall.content.marks.sequence')}</option>
          </select>
        </label>
        <label className="block text-xs text-sky-200">
          {t('wall.content.typeStart')}
          <NumberField value={content?.numbering?.typeStart} fallback={1} disabled={!sequence} label={t('wall.content.typeStart')} onCommit={(n) => report(setNumbering(schedule.id, { typeStart: n }))} />
        </label>
        <label className="block text-xs text-sky-200">
          {t('wall.content.elementStart')}
          <NumberField value={content?.numbering?.elementStart} fallback={1} label={t('wall.content.elementStart')} onCommit={(n) => report(setNumbering(schedule.id, { elementStart: n }))} />
        </label>
      </div>
      <p className="m-0 mt-1 text-xs text-sky-200">{t('wall.content.tags')}</p>

      <div className="mt-3">
        <button type="button" className={WALL_PILL} disabled={!content} onClick={() => resetContent(schedule.id)}>{t('wall.content.reset')}</button>
      </div>
    </CardSection>
  );
}
