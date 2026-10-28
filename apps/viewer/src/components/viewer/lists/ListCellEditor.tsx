/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The cell picked on the sheet (#446), in the viewport card of a list schedule: which element and column it is, what the model says, and a
 * field to type another value over it. A typed value is an override (`ListScheduleDef.overrides`), kept by GlobalId and property, marked
 * on the sheet in the editor and never printed as a mark; "Reset to model value" takes it away. Each edit is one undo step.
 */

import { useMemo, useState } from 'react';
import { listColumnKey, listScheduleTable, listTableCells, overrideOf } from '@bimvoice/ifcsheet';
import { entityName } from '@/lib/commands/modeling/authored-kinds';
import { useTranslation } from '@/i18n';
import { useViewerStore } from '@/store';
import { pickCell, useCellPick } from '@/joinery/list-cell-pick';
import { resetListCellOverride, setListCellOverride } from '@/joinery/list-schedule-actions';
import { useSheetLocale } from '@/project/units-and-numbers';
import type { ProjectSchedule } from '@/project/types';
import { listTableSourceOf, type ListScheduleRun } from '@/lib/lists/list-schedule-run';
import { WALL_FIELD, WALL_LABEL, WALL_PILL } from '../wall/wall-type';
import { useListScheduleRun, useListWords } from './useListSchedule';

/** What the element in row `at` of the run is called: its Name, else its GlobalId. */
function elementName(run: ListScheduleRun, at: number, guid: string): string {
  const row = run.result.rows[at];
  const model = row ? useViewerStore.getState().models.get(row.modelId) : undefined;
  const store = model?.ifcDataStore;
  return (store && row ? entityName({ dataStore: store, view: useViewerStore.getState().mutationViews.get(row.modelId) ?? null }, row.entityId) : '') || guid;
}

export function ListCellEditor({ schedule }: { schedule: ProjectSchedule }) {
  const { t } = useTranslation();
  const locale = useSheetLocale();
  const words = useListWords();
  const pick = useCellPick((s) => s.pick);
  const state = useListScheduleRun(schedule);
  const list = schedule.list;
  const mine = pick && pick.scheduleId === schedule.id ? pick : null;
  const found = useMemo(() => {
    if (!mine || !list || state?.status !== 'ok') return null;
    const column = list.columns.find((c) => c.id === mine.column);
    const at = state.run.guids?.indexOf(mine.guid) ?? -1;
    if (!column || at < 0) return null;
    // The model's value and the printed one, from the same table, with and without the overrides.
    const cellOf = (overrides: typeof list.overrides): string => {
      const table = listScheduleTable(listTableSourceOf(state.run, { ...list, overrides }, words), list, schedule.name, words);
      const row = table.guids?.indexOf(mine.guid) ?? -1, col = (table.columnIds ?? []).indexOf(column.id);
      return row < 0 || col < 0 ? '' : listTableCells(table, locale)[row][col];
    };
    return { column, about: elementName(state.run, at, mine.guid), model: cellOf(undefined), printed: cellOf(list.overrides) };
  }, [mine, list, state, words, locale, schedule.name]);
  const current = mine && list && found ? overrideOf(list.overrides, mine.guid, listColumnKey(found.column)) : undefined;
  const [draft, setDraft] = useState<{ key: string; text: string } | null>(null);
  if (!list || !mine) return <p className="m-0 mt-3 text-xs text-sky-200">{t('listSched.cell.hint')}</p>;
  if (!found) return <p className="m-0 mt-3 text-xs text-sky-200">{t('listSched.cell.gone')}</p>;
  const key = `${mine.guid}:${mine.column}:${current?.value ?? ''}`;
  // What the field holds untouched: the override, else the cell as printed (a dash is a blank cell).
  const base = current ? current.value : found.printed === '—' ? '' : found.printed;
  const text = draft?.key === key ? draft.text : base;
  const commit = (): void => { if (text !== base) setListCellOverride(schedule.id, mine.guid, mine.column, text, found.about); };
  const columnName = found.column.label ?? found.column.propertyName;
  return (
    <div className="mt-3 border-t border-sky-300/20 pt-2" data-list-cell-editor="">
      <p className="m-0 text-xs font-medium text-white">{t('listSched.cell.title', { column: columnName, element: found.about })}</p>
      <p className="m-0 mt-1 text-xs text-sky-200">{t('listSched.cell.model', { value: found.model })}</p>
      <label className={`${WALL_LABEL} mt-2`}>
        {t('listSched.cell.value')}
        <input className={WALL_FIELD} value={text} onChange={(e) => setDraft({ key, text: e.target.value })} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />
      </label>
      {current ? <p className="m-0 mt-1 text-xs text-amber-200">{t('listSched.cell.overridden')}</p> : null}
      <div className="mt-2 flex gap-2">
        <button type="button" className={WALL_PILL} disabled={!current} onClick={() => { resetListCellOverride(schedule.id, mine.guid, mine.column); setDraft(null); }}>{t('listSched.cell.reset')}</button>
        <button type="button" className={WALL_PILL} onClick={() => pickCell(null)}>{t('listSched.cell.done')}</button>
      </div>
    </div>
  );
}
