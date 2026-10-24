/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the sub-report card says about duplicates and gaps (#186): on the schedule, whether its parts list every element
 * exactly once; on a part, the elements it shares with another part. In plain words, with the types and storeys involved,
 * and a button where one change sets it right. The rule is the engine's (`checkSubReports`, through `check/sub-report-check`),
 * the same the "What the model lacks" list reads, so the card and the list cannot disagree.
 */

import { useMemo } from 'react';
import { scheduleFilterProperties, subReportParams, type SubReportCheck, type SubReportFix } from '@bimvoice/ifcsheet';
import { useTranslation } from '@/i18n';
import { useViewerStore } from '@/store';
import { useProjectStore } from '@/project/project-store';
import { scheduleData } from '@/joinery/schedule-data';
import { subReportCheckOf } from '@/check/sub-report-check';
import { setSubReportFilter } from '@/joinery/schedules';
import type { ProjectSchedule } from '@/project/types';
import { WALL_PILL } from './wall-type';

/** The model's rows for the schedule's kind, whole: what the parts are cut from. */
export function useParentRows(kind: ProjectSchedule['kind']) {
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  const models = useViewerStore((s) => s.models);
  const catalogue = useProjectStore((s) => s.joineryTypes);
  const mapping = useProjectStore((s) => s.joineryMapping);
  // The properties the filters name: the rows carry only those, so a new property test re-reads the model.
  const properties = useProjectStore((s) => scheduleFilterProperties(s.schedules ?? []).join(','));
  // mutationVersion / models / catalogue / mapping / properties: the inputs `scheduleData` reads from the stores.
  return useMemo(() => scheduleData(kind as 'door' | 'window' | 'all'), [kind, mutationVersion, models, catalogue, mapping, properties]);
}

/** Apply a fix: each edited part keeps what its new filter names. */
function apply(fix: SubReportFix): void {
  for (const { partId, filter } of fix.edits) setSubReportFilter(partId, { kinds: filter.kinds, levels: filter.levels, types: filter.types });
}

export function SubReportChecks({ schedule }: { schedule: ProjectSchedule }) {
  const { t } = useTranslation();
  const schedules = useProjectStore((s) => s.schedules ?? []);
  const parent = schedule.sub ? schedules.find((s) => s.id === schedule.sub!.parent) : schedule;
  const rows = useParentRows(parent?.kind ?? schedule.kind);
  const check: SubReportCheck | null = useMemo(() => (parent ? subReportCheckOf(parent, schedules, () => rows) : null), [parent, schedules, rows]);
  if (!check || check.parts.length === 0) return null;
  // A part says what it shares with another part and what it could take; the schedule says all of it.
  const mine = (ids: readonly string[]) => !schedule.sub || ids.includes(schedule.id);
  const duplicates = check.duplicates.filter((d) => mine(d.parts.map((p) => p.id)));
  const fixes = check.fixes.filter((f) => mine([f.part.id, ...f.edits.map((e) => e.partId)]));
  const gaps = !schedule.sub || fixes.some((f) => f.kind === 'add') ? check.gaps : [];
  if (duplicates.length === 0 && gaps.length === 0) return schedule.sub ? null : <p className="m-0 mt-3 text-xs text-sky-200">{t('wall.check.ok')}</p>;
  const dup = subReportParams(duplicates, check.parent.name);
  const gap = subReportParams(gaps, check.parent.name);
  return (
    <output data-owns-keys className="mt-3 block rounded-xl border border-amber-300/40 bg-amber-400/10 p-3">
      <p className="m-0 text-2xs font-medium uppercase tracking-widest text-amber-300">{t('wall.check.title')}</p>
      {duplicates.length > 0 ? <p className="m-0 mt-1 text-sm text-sky-100">{t('wall.check.duplicates', dup)}</p> : null}
      {gaps.length > 0 ? <p className="m-0 mt-1 text-sm text-sky-100">{t('wall.check.gaps', gap)}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {fixes.map((f) => (
          <button key={`${f.kind}-${f.part.id}`} type="button" className={WALL_PILL} onClick={() => apply(f)}>
            {t(f.kind === 'add' ? 'wall.check.fixAdd' : 'wall.check.fixKeep', { part: f.part.name, types: f.types })}
          </button>
        ))}
      </div>
    </output>
  );
}
