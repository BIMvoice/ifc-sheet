/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The viewport card's part for a joinery schedule (#186): split it into sub-reports (doors and windows apart, one per storey,
 * or picked by hand), and for a sub-report, choose what it keeps: its kinds, its storeys, its types. A new sub-report is hung
 * on a sheet of its own like any schedule (`hangSchedule`), where it fits the paper through the same layout; it can also be
 * placed on another sheet from the card's place list.
 */

import { useMemo } from 'react';
import { applyContent, contentOf } from '@bimvoice/ifcsheet';
import { useTranslation } from '@/i18n';
import { useProjectStore } from '@/project/project-store';
import { hangSchedule } from '@/project/drawing-set-actions';
import { addSubReport, canSplit, setSubReportFilter, splitByExterior, splitByKind, splitByLevel, subReportsOf, toggled } from '@/joinery/schedules';
import type { ProjectSchedule } from '@/project/types';
import { stepInto } from './wall-nav';
import { WALL_PILL } from './wall-type';
import { SubReportChecks, useParentRows, useSubReportCheck } from './SubReportChecks';
import { CardSection } from './CardSection';
import { subSummary } from './card-section-summary';

const quiet = WALL_PILL;
const KINDS = ['door', 'window'] as const;

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

/** Hang each new sub-report on its own sheet and step into the first. */
function placeAll(ids: readonly string[]): void {
  const sheets = ids.map((id) => hangSchedule(id));
  stepInto(sheets.find((s): s is string => !!s) ?? null);
}

export function SubReportCard({ schedule }: { schedule: ProjectSchedule }) {
  const { t } = useTranslation();
  const schedules = useProjectStore((s) => s.schedules ?? []);
  const whole = useParentRows(schedule.kind);
  // The parent's types as the schedule prints them (its numbering): the labels here are the marks on the sheet.
  const data = useMemo(() => applyContent(whole, contentOf(schedules, schedule)), [whole, schedules, schedule]);
  const parts = subReportsOf(schedules, schedule.id);
  const sub = schedule.sub;
  const found = useSubReportCheck(schedule);

  if (sub) {
    const kinds = sub.filter.kinds ?? KINDS;
    const levels = sub.filter.levels ?? data.levels;
    const types = sub.filter.types ?? data.entries.map((e) => e.key);
    // The types it could list: those of the kinds it keeps.
    const choices = data.entries.filter((e) => kinds.includes(e.kind));
    const parent = schedules.find((s) => s.id === sub.parent);
    const summary = subSummary({ sub, parts: 0, levels: data.levels.length, types: data.entries.length, duplicates: (found?.duplicates.length ?? 0) > 0, gaps: (found?.gaps.length ?? 0) > 0 }, t);
    const warned = (found?.duplicates.length ?? 0) > 0 || (found?.gaps.length ?? 0) > 0;
    return (
      <CardSection id="sub" title={t('wall.sub.title')} summary={summary.text} defaultOpen={summary.changed || warned} warn={warned}>
        {parent ? <p className="m-0 mt-1 text-xs text-sky-200">{t('wall.sub.partOf', { name: parent.name })}</p> : null}
        <SubReportChecks schedule={schedule} found={found} />
        {schedule.kind === 'all' ? (
          <fieldset className="m-0 mt-3 border-0 p-0">
            <legend className="p-0 text-xs text-sky-200">{t('wall.sub.kinds')}</legend>
            <div className="mt-1 grid grid-cols-2 gap-1.5">
              {KINDS.map((k) => (
                <Toggle key={k} label={t(k === 'door' ? 'wall.sub.doors' : 'wall.sub.windows')} on={kinds.includes(k)} onClick={() => setSubReportFilter(schedule.id, { kinds: toggled(sub.filter.kinds, k, KINDS) })} />
              ))}
            </div>
          </fieldset>
        ) : null}
        {data.levels.length > 0 ? (
          <fieldset className="m-0 mt-3 border-0 p-0">
            <legend className="p-0 text-xs text-sky-200">{t('wall.sub.levels')}</legend>
            <div className="mt-1 grid grid-cols-2 gap-1.5">
              {data.levels.map((l) => (
                <Toggle key={l} label={l} on={levels.includes(l)} onClick={() => setSubReportFilter(schedule.id, { levels: toggled(sub.filter.levels, l, data.levels) })} />
              ))}
            </div>
          </fieldset>
        ) : null}
        <fieldset className="m-0 mt-3 border-0 p-0">
          <legend className="p-0 text-xs text-sky-200">
            {t('wall.sub.types')} · {t('wall.sub.keeps', { count: choices.filter((e) => types.includes(e.key)).length, total: choices.length })}
          </legend>
          <div className="mt-1 flex gap-1.5">
            <button type="button" className={quiet} onClick={() => setSubReportFilter(schedule.id, { types: undefined })}>{t('wall.sub.all')}</button>
          </div>
          <ul className="m-0 mt-1 max-h-40 list-none overflow-y-auto p-0">
            {choices.map((e) => (
              <li key={e.key}>
                <label className="flex items-center gap-2 py-0.5 text-sm text-sky-100">
                  <input
                    type="checkbox" checked={types.includes(e.key)}
                    onChange={() => setSubReportFilter(schedule.id, { types: toggled(sub.filter.types, e.key, data.entries.map((x) => x.key)) })}
                  />
                  {e.mark} {e.name} · {Math.round(e.width * 1000)}×{Math.round(e.height * 1000)}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      </CardSection>
    );
  }

  if (!canSplit(schedule)) return null;
  const warned = (found?.duplicates.length ?? 0) > 0 || (found?.gaps.length ?? 0) > 0;
  const summary = subSummary({ sub: undefined, parts: parts.length, levels: 0, types: 0, duplicates: (found?.duplicates.length ?? 0) > 0, gaps: (found?.gaps.length ?? 0) > 0 }, t);
  return (
    <CardSection id="sub" title={t('wall.sub.title')} summary={summary.text} defaultOpen={warned} warn={warned}>
      {parts.length === 0 ? <p className="m-0 mt-1 text-xs text-sky-200">{t('wall.sub.none')}</p> : (
        <ul className="m-0 mt-1 list-none p-0 text-sm text-sky-100">{parts.map((p) => <li key={p.id}>{p.name}</li>)}</ul>
      )}
      <SubReportChecks schedule={schedule} found={found} />
      <div className="mt-3 flex flex-wrap gap-2">
        {schedule.kind === 'all' ? <button type="button" className={quiet} onClick={() => placeAll(splitByKind(schedule.id, { door: t('wall.sub.doors'), window: t('wall.sub.windows') }))}>{t('wall.sub.byKind')}</button> : null}
        <button type="button" className={quiet} onClick={() => placeAll(splitByExterior(schedule.id, { exterior: t('wall.sub.exterior'), interior: t('wall.sub.interior') }))}>{t('wall.sub.byExterior')}</button>
        {data.levels.length > 1 ? <button type="button" className={quiet} onClick={() => placeAll(splitByLevel(schedule.id, data.levels))}>{t('wall.sub.byLevel')}</button> : null}
        <button type="button" className={quiet} onClick={() => { const id = addSubReport(schedule.id, t('wall.sub.newName', { name: schedule.name }), {}); if (id) placeAll([id]); }}>{t('wall.sub.add')}</button>
      </div>
    </CardSection>
  );
}
