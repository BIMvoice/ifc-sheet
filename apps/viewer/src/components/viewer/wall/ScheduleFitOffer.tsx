/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * On a sheet stepped into: a joinery schedule that does not fit the paper at its scale says so and offers to split (#186), the
 * way the schedule's card does by hand: doors and windows apart, or one per storey, each part hung on a sheet of its own. Or to
 * keep it as it is, paging on A-6xx.1… (the default, which nothing here changes until a split is chosen). The split is one undo step.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from '@/i18n';
import { runAsOneUndoStep } from '@/drafting/draft-store';
import { hangSchedule } from '@/project/drawing-set-actions';
import { scheduleBox } from '@/project/schedule-fit';
import { useProjectStore } from '@/project/project-store';
import type { ProjectSchedule, ProjectSheet, SheetViewport } from '@/project/types';
import { splitOfferFor, type SplitOffer } from '@/joinery/schedule-split-offer';
import { splitByKind, splitByLevel } from '@/joinery/schedules';
import { scheduleData, type ScheduleData, type ScheduleKind } from '@/joinery/schedule-data';
import { useViewerStore } from '@/store';
import { stepInto } from './wall-nav';
import { WALL_CARD, WALL_EYEBROW, WALL_PILL } from './wall-type';

type Read = (kind: ScheduleKind) => ScheduleData;

function Offer({ sheet, vp, schedule, read }: { sheet: ProjectSheet; vp: SheetViewport; schedule: ProjectSchedule; read: Read }) {
  const { t } = useTranslation();
  const schedules = useProjectStore((s) => s.schedules ?? []);
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  const models = useViewerStore((s) => s.models);
  const catalogue = useProjectStore((s) => s.joineryTypes);
  const mapping = useProjectStore((s) => s.joineryMapping);
  const [kept, setKept] = useState(false);
  // mutationVersion / models / catalogue / mapping: the inputs `scheduleData` reads from the stores.
  const data = useMemo(() => read(schedule.kind as ScheduleKind), [read, schedule.kind, mutationVersion, models, catalogue, mapping]);
  const offer: SplitOffer | null = splitOfferFor(schedule, schedules, data, vp.scale, scheduleBox(sheet, vp));
  if (!offer || kept) return null;

  /** Make the parts, hang each on a sheet of its own, and step into the first: all one undo step. */
  const split = (make: () => string[]): void => {
    let sheets: (string | null)[] = [];
    runAsOneUndoStep(() => { sheets = make().map((id) => hangSchedule(id, data)); });
    stepInto(sheets.find((id) => id !== null) ?? null);
  };
  return (
    <section data-owns-keys data-schedule-fit-offer className={`${WALL_CARD} absolute bottom-3 left-3 max-h-[calc(100%-1.5rem)]`}>
      <p className={WALL_EYEBROW}>{t('wall.fitOffer.title')}</p>
      <p className="m-0 mt-2 text-sm text-sky-100">{t('wall.fitOffer.body', { name: schedule.name, pages: offer.pages, scale: vp.scale })}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {offer.byKind ? <button type="button" className={WALL_PILL} onClick={() => split(() => splitByKind(schedule.id, { door: t('wall.sub.doors'), window: t('wall.sub.windows') }))}>{t('wall.sub.byKind')}</button> : null}
        {offer.levels.length > 0 ? <button type="button" className={WALL_PILL} onClick={() => split(() => splitByLevel(schedule.id, offer.levels))}>{t('wall.sub.byLevel')}</button> : null}
        <button type="button" className={WALL_PILL} onClick={() => setKept(true)}>{t('wall.fitOffer.keep')}</button>
      </div>
    </section>
  );
}

/** The offers for the schedules on `sheet`'s first page (a continuation sheet follows its first). `read` stands in for the model's rows. */
export function ScheduleFitOffer({ sheet, read = scheduleData }: { sheet: ProjectSheet; read?: Read }) {
  const schedules = useProjectStore((s) => s.schedules ?? []);
  return (
    <>
      {(sheet.viewports ?? []).filter((vp) => (vp.page ?? 0) === 0).flatMap((vp) => {
        const schedule = schedules.find((s) => s.id === vp.viewId);
        return schedule ? [<Offer key={vp.id} sheet={sheet} vp={vp} schedule={schedule} read={read} />] : [];
      })}
    </>
  );
}
