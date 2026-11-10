/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The cell of a door and window schedule picked on the sheet (#446), in the viewport card: which type and row it is, what the model says,
 * and a field to type another text over it. A typed text is kept by the type's identity and the row (`joineryOverrides`), prints for that
 * type in every joinery schedule, is marked on the sheet in the editor only, and "Reset to model value" takes it away. Each edit is one undo step.
 */

import { useMemo, useState } from 'react';
import { entryMarks, joineryOverrideOf, levelRowId, markCell, MARK_ROW, modelRowLabel, typeIdentityOf } from '@bimvoice/ifcsheet';
import { useTranslation } from '@/i18n';
import { useViewerStore } from '@/store';
import { useProjectStore } from '@/project/project-store';
import { isJoinerySchedule } from '@/project/schedule-fit';
import { pickCell, useCellPick } from '@/joinery/list-cell-pick';
import { resetJoineryCellOverride, setJoineryCellOverride } from '@/joinery/joinery-override-actions';
import { cellTextOf } from '@/joinery/schedule-layout';
import { scheduleData, type ScheduleKind } from '@/joinery/schedule-data';
import { scheduleDataOf } from '@/joinery/schedule-split';
import type { ProjectSchedule } from '@/project/types';
import { useScheduleLabels } from '../joinery/ScheduleGraphic';
import { WALL_FIELD, WALL_LABEL, WALL_PILL } from './wall-type';
import { CardSection } from './CardSection';
import { ROW_LABELS } from './ScheduleContentCard';
import { describeEntry } from './ScheduleTextCard';

export function JoineryCellCard({ schedule }: { schedule: ProjectSchedule }) {
  const { t } = useTranslation();
  const pick = useCellPick((s) => s.pick);
  const schedules = useProjectStore((s) => s.schedules ?? []);
  const overrides = useProjectStore((s) => s.joineryOverrides);
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  const models = useViewerStore((s) => s.models);
  const catalogue = useProjectStore((s) => s.joineryTypes);
  const mapping = useProjectStore((s) => s.joineryMapping);
  const labels = useScheduleLabels(schedule.name);
  const mine = pick && pick.scheduleId === schedule.id ? pick : null;
  // mutationVersion / models / catalogue / mapping: the inputs `scheduleData` reads from the stores.
  const joinery = isJoinerySchedule(schedule);
  const whole = useMemo(() => (joinery ? scheduleData(schedule.kind as ScheduleKind) : null), [joinery, schedule.kind, mutationVersion, models, catalogue, mapping]);
  const found = useMemo(() => {
    if (!mine || !whole) return null;
    const data = scheduleDataOf(schedule, () => whole, schedules, overrides);
    const entry = data.entries.find((e) => typeIdentityOf(e) === mine.guid || e.key === mine.guid);
    if (!entry) return null;
    // Every group of the kind, not only this part's: a saved cell belongs to the nearest of them (#485).
    return { entry, groups: whole.entries, about: describeEntry(entry), model: mine.column === MARK_ROW ? markCell(entry, undefined, whole.entries) : cellTextOf({ ...data, overrides: undefined }, labels, entry, mine.column) };
  }, [mine, schedule, whole, schedules, overrides, labels]);
  const [draft, setDraft] = useState<{ key: string; text: string } | null>(null);
  if (!joinery) return null;
  const properties = (schedules.find((s) => s.id === schedule.id) ?? schedule).content?.properties ?? [];
  const own = mine ? properties.find((r) => r.id === mine.column) : undefined;
  const levelName = mine && mine.column === levelRowId(mine.column.slice(7)) ? mine.column.slice(7) : null;
  const rowName = mine ? (mine.column === MARK_ROW ? labels.mark : ROW_LABELS[mine.column] ? t(ROW_LABELS[mine.column]) : own ? modelRowLabel(own, properties) : levelName ?? mine.column) : '';
  const current = mine && found ? joineryOverrideOf(overrides, found.entry, mine.column, found.groups) : undefined;
  const summary = mine && found ? t('joineryCell.summaryPicked', { row: rowName, type: found.about }) : t('joineryCell.summary');
  // One typed mark would stand over every element of the type (#636): where the type's elements carry different marks (their own Tags) and none is typed yet, it would overwrite them all, so the cell is read only and says where the marks are set.
  const several = mine && found && mine.column === MARK_ROW && !current && entryMarks(found.entry, undefined, found.groups).length > 1;
  const key = mine ? `${mine.guid}:${mine.column}:${current?.value ?? ''}` : '';
  // What the field holds untouched: the typed text, else the cell as the model states it (a dash is a blank cell).
  const base = current ? current.value : found?.model === '—' ? '' : found?.model ?? '';
  const text = draft?.key === key ? draft.text : base;
  const commit = (): void => { if (mine && found && text !== base) setJoineryCellOverride(found.entry, mine.column, text, found.about, found.groups); };
  return (
    <CardSection id="joinery-cell" title={t('joineryCell.title')} summary={summary} defaultOpen={mine !== null}>
      {!mine ? <p className="m-0 mt-1 text-xs text-sky-200">{t('joineryCell.hint')}</p> : !found ? <p className="m-0 mt-1 text-xs text-sky-200">{t('joineryCell.gone')}</p> : (
        <div data-joinery-cell-editor="">
          <p className="m-0 mt-1 text-xs font-medium text-white">{t('joineryCell.heading', { row: rowName, type: found.about })}</p>
          <p className="m-0 mt-1 text-xs text-sky-200">{t('joineryCell.model', { value: found.model })}</p>
          {mine.column === 'size' && found.entry.measured ? <p className="m-0 mt-1 text-xs text-sky-200">{t('joineryCell.measured')}</p> : null}
          {several ? <p data-joinery-mark-several="" className="m-0 mt-2 text-xs text-amber-200">{t('joineryCell.markSeveral')}</p> : (
            <label className={`${WALL_LABEL} mt-2`}>
              {t('joineryCell.value')}
              <input className={WALL_FIELD} value={text} onChange={(e) => setDraft({ key, text: e.target.value })} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />
            </label>
          )}
          {current ? <p className="m-0 mt-1 text-xs text-amber-200">{t('joineryCell.overridden')}</p> : null}
          <div className="mt-2 flex gap-2">
            <button type="button" className={WALL_PILL} disabled={!current} onClick={() => { resetJoineryCellOverride(found.entry, mine.column, found.groups); setDraft(null); }}>{t('joineryCell.reset')}</button>
            <button type="button" className={WALL_PILL} onClick={() => pickCell(null)}>{t('joineryCell.done')}</button>
          </div>
        </div>
      )}
    </CardSection>
  );
}
