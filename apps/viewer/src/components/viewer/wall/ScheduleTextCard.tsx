/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The viewport card's part for the text a joinery schedule carries (#186, section 4): rows typed in by hand (a manufacturer, a
 * remark, a note) with one cell per type, printed on the sheet beside the rows read from the model. Cells are keyed by the type,
 * so they stay with it when types are added or reordered. The text of a type the model no longer lists is shown apart, kept and
 * not printed, until the user removes it. A sub-report edits the text of the schedule it was cut from.
 */

import { useEffect, useMemo, useState } from 'react';
import { cleanText, MAX_LABEL_LENGTH, MAX_TEXT_LENGTH, MAX_TEXT_ROWS, orphanCells, textCellText, textOwner } from '@bimvoice/ifcsheet';
import { useTranslation } from '@/i18n';
import { useViewerStore } from '@/store';
import { useProjectStore } from '@/project/project-store';
import { isJoinerySchedule } from '@/project/schedule-fit';
import { scheduleData, type ScheduleEntry, type ScheduleKind } from '@/joinery/schedule-data';
import { scheduleDataOf } from '@/joinery/schedule-split';
import { addScheduleTextRow, removeScheduleTextCell, removeScheduleTextRow, renameScheduleTextRow, setScheduleTextCell } from '@/joinery/schedule-text-actions';
import type { ProjectSchedule } from '@/project/types';
import { WALL_FIELD, WALL_PILL } from './wall-type';

/** What a type is called in the card, and what a cell remembers of it for when the type is gone. */
export function describeEntry(e: Pick<ScheduleEntry, 'mark' | 'name' | 'width' | 'height'>): string {
  const size = `${Math.round(e.width * 1000)}×${Math.round(e.height * 1000)}`;
  return e.mark && e.mark !== '—' ? `${e.mark} ${e.name}` : `${e.name} ${size}`;
}

/** A text field that keeps what is typed until it is left (or Enter), so a trailing space can be typed on the way to the next word. */
function TextField({ value, label, max, onCommit }: { value: string; label: string; max: number; onCommit: (text: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      aria-label={label} className={WALL_FIELD} value={draft} maxLength={max}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { const clean = cleanText(draft, max); setDraft(clean); if (clean !== value) onCommit(clean); }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
}

/** The model's rows for the schedule's kind, whole: the types that exist now. */
function useModelRows(kind: ProjectSchedule['kind']) {
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  const models = useViewerStore((s) => s.models);
  const catalogue = useProjectStore((s) => s.joineryTypes);
  const mapping = useProjectStore((s) => s.joineryMapping);
  // mutationVersion / models / catalogue / mapping: the inputs `scheduleData` reads from the stores.
  return useMemo(() => scheduleData(kind as ScheduleKind), [kind, mutationVersion, models, catalogue, mapping]);
}

export function ScheduleTextCard({ schedule }: { schedule: ProjectSchedule }) {
  const { t } = useTranslation();
  const schedules = useProjectStore((s) => s.schedules ?? []);
  const owner = textOwner(schedules, schedule);
  const whole = useModelRows(owner?.kind ?? schedule.kind);
  const shown = useMemo(() => scheduleDataOf(schedule, () => whole, schedules), [schedule, whole, schedules]);
  if (!isJoinerySchedule(schedule)) return null;

  const rows = shown.textRows ?? [];
  const orphans = orphanCells(owner?.textRows, new Set(whole.entries.map((e) => e.key)));
  const inherited = owner && owner.id !== schedule.id ? owner : null;
  return (
    <div data-owns-keys className="mt-4 border-t border-sky-300/20 pt-4">
      <p className="m-0 text-2xs font-medium uppercase tracking-widest text-cyan-400">{t('wall.text.title')}</p>
      <p className="m-0 mt-1 text-xs text-sky-200">{inherited ? t('wall.text.inherited', { name: inherited.name }) : rows.length === 0 ? t('wall.text.none') : t('wall.text.hint')}</p>
      {rows.map((row) => (
        <fieldset key={row.id} className="m-0 mt-3 border-0 p-0">
          <div className="flex items-end gap-2">
            <TextField value={row.label} label={t('wall.text.rowName')} max={MAX_LABEL_LENGTH} onCommit={(text) => renameScheduleTextRow(schedule.id, row.id, text)} />
            <button type="button" aria-label={t('wall.text.removeRow')} className={`${WALL_PILL} mb-0.5`} onClick={() => removeScheduleTextRow(schedule.id, row.id)}>{t('wall.text.removeRow')}</button>
          </div>
          <ul className="m-0 mt-1 max-h-48 list-none overflow-y-auto p-0">
            {shown.entries.map((e) => (
              <li key={e.key} className="grid grid-cols-[8rem_1fr] items-center gap-2">
                <span className="truncate text-xs text-sky-200">{describeEntry(e)}</span>
                <TextField
                  value={textCellText(row, e.key)} label={t('wall.text.cell', { row: row.label, type: describeEntry(e) })} max={MAX_TEXT_LENGTH}
                  onCommit={(text) => setScheduleTextCell(schedule.id, row.id, e.key, text, describeEntry(e))}
                />
              </li>
            ))}
          </ul>
        </fieldset>
      ))}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={WALL_PILL} disabled={(owner?.textRows?.length ?? 0) >= MAX_TEXT_ROWS} onClick={() => addScheduleTextRow(schedule.id, t('wall.text.newName'))}>{t('wall.text.add')}</button>
        {(owner?.textRows?.length ?? 0) >= MAX_TEXT_ROWS ? <span className="text-xs text-sky-200">{t('wall.text.full', { max: MAX_TEXT_ROWS })}</span> : null}
      </div>
      {orphans.length > 0 ? (
        <div className="mt-4">
          <p className="m-0 text-xs font-medium text-amber-300">{t('wall.text.orphans')}</p>
          <p className="m-0 mt-1 text-xs text-sky-200">{t('wall.text.orphanHint')}</p>
          <ul className="m-0 mt-1 list-none p-0">
            {orphans.map((o) => (
              <li key={`${o.rowId}:${o.key}`} className="flex items-center justify-between gap-2 py-0.5 text-sm text-sky-100">
                <span className="min-w-0 truncate">{o.rowLabel} · {o.about || o.key}: {o.text}</span>
                <button type="button" className={WALL_PILL} onClick={() => removeScheduleTextCell(schedule.id, o.rowId, o.key)}>{t('wall.text.orphanRemove')}</button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
