/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the model lacks (`check/readiness.ts`), in the look of the set's
 * "What is missing" list (a `SetSkin`): each line says what the IFC is missing
 * and, unless `compact`, which feature is weaker for it. Read again when a
 * model opens or closes and after an edit (`mutationVersion`), not on every render.
 */

import { useMemo } from 'react';
import { useTranslation } from '@/i18n';
import { describeEffect, describeMissing } from '@/check/readiness-say';
import { modelReadiness } from '@/check/readiness';
import { currentModelFacts } from '@/check/readiness-read';
import { useViewerStore } from '@/store';
import { setIncludeFarElements, useProjectStore } from '@/project/project-store';
import { subReportChecks } from '@/check/sub-report-check';
import type { SetSkin } from './set-skin';
import { setReview } from '../wall/wall-nav';
import { goToRoom } from '@/check/room-go';

/**
 * The findings of the models open now; null while none is open (nothing to say yet). `owners` names, for each sub-report finding in
 * the order they come, the schedule it is about (`modelReadiness` emits a duplicates finding then a gaps finding per check), so a
 * finding can open the review of that schedule.
 */
function useModelReadiness() {
  const models = useViewerStore((s) => s.models);
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  const schedules = useProjectStore((s) => s.schedules);
  const catalogue = useProjectStore((s) => s.joineryTypes);
  const mapping = useProjectStore((s) => s.joineryMapping);
  const includeFar = useProjectStore((s) => s.includeFarElements);
  const levels = useProjectStore((s) => s.levels);
  return useMemo(() => {
    void mutationVersion; // an edit can add or remove what the facts count
    // A schedule split into parts must list every element once: the same check the card on the Wall shows.
    if (models.size === 0) return null;
    const checks = subReportChecks(schedules ?? []);
    const owners = checks.flatMap((c) => [...(c.duplicates.length > 0 ? [c.parent.id] : []), ...(c.gaps.length > 0 ? [c.parent.id] : [])]);
    return { findings: modelReadiness(currentModelFacts(), checks), owners };
  }, [models, mutationVersion, schedules, catalogue, mapping, includeFar, levels]);
}

/** The project setting that frames the views on everything again, the small far-away elements too (`framing.ts` in the engine). */
function FramingSetting({ skin }: { skin: SetSkin }) {
  const { t } = useTranslation();
  const on = useProjectStore((s) => s.includeFarElements === true);
  return (
    <div className="mt-2">
      <label className={`flex items-center gap-2 ${skin.heading}`}>
        <input type="checkbox" checked={on} aria-describedby="framing-far-hint" onChange={(e) => setIncludeFarElements(e.target.checked)} />
        <span>{t('ready.framing.label')}</span>
      </label>
      <p id="framing-far-hint" className={`m-0 ${skin.note}`}>{t('ready.framing.hint')}</p>
    </div>
  );
}

/** Opens the review by element of the schedule a sub-report finding is about (#186). */
function ReviewLink({ scheduleId, skin }: { scheduleId: string | undefined; skin: SetSkin }) {
  const { t } = useTranslation();
  if (!scheduleId) return null;
  return (
    <button type="button" className={`${skin.note} underline`} onClick={() => setReview(scheduleId)}>{t('wall.review.open')}</button>
  );
}

/** Opens the plan of the first room whose area is estimated and zooms to it. */
function RoomLink({ guid, skin }: { guid: string; skin: SetSkin }) {
  const { t } = useTranslation();
  return <button type="button" className={`${skin.note} underline`} onClick={() => goToRoom(guid)}>{t('ready.estimatedAreas.go')}</button>;
}

export function ReadinessList({ skin, compact = false }: { skin: SetSkin; compact?: boolean }) {
  const { t } = useTranslation();
  const readiness = useModelReadiness();
  if (readiness === null) return null;
  const { findings, owners } = readiness;
  let nextOwner = 0;
  if (findings.length === 0) return compact ? null : <><p className={skin.note}>{t('ready.none')}</p><FramingSetting skin={skin} /></>;
  return (
    <>
    <ul className="m-0 list-none p-0">
      {findings.map((f) => (
        <li key={`${f.kind}-${f.params.schedule ?? ''}`} className="py-0.5">
          <p className={`m-0 ${compact ? skin.note : skin.heading}`}>{describeMissing(f)}</p>
          {compact ? null : <p className={`m-0 ${skin.note}`}>{describeEffect(f)}</p>}
          {f.kind === 'estimatedAreas' ? <RoomLink guid={String(f.params.first)} skin={skin} /> : null}
          {f.kind === 'subReportDuplicates' || f.kind === 'subReportGaps' ? <ReviewLink scheduleId={owners[nextOwner++]} skin={skin} /> : null}
        </li>
      ))}
    </ul>
    {compact ? null : <FramingSetting skin={skin} />}
    </>
  );
}
