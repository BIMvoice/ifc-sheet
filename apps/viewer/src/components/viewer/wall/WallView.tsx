/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Wall: the drawing set as one surface. When a model opens on a project
 * with no sheets, the set is laid out at once (`startSet`) and the
 * model's arrival is announced; then every sheet hangs in view, and one can be
 * stepped into to be corrected where it hangs.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/i18n';
import { useNextTaskValue } from '@/hooks/useNextTaskValue';
import { useDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { isSetSheet } from '@/project/drawing-set';
import { sectionProposals } from '@/project/drawing-set-actions';
import { startSet } from '@/set-template/start';
import { setExtent } from '@/draft-set/body';
import { useProjectStore } from '@/project/project-store';
import { useViewerStore } from '@/store';
import { EVENT_WALL_HUNG, emitWallHung } from '@/lib/tours/events';
import { SteppedSheet } from './SteppedSheet';
import { WallGrid } from './WallGrid';
import { WallCompare } from './WallCompare';
import { WallIntro } from './WallIntro';
import { openDemoModel } from '../ifcsheet/demo-model';
import { ProjectDrawer } from './ProjectDrawer';
import { NewFromTemplate } from './SetTemplate';
import { IssuePanel, MissingPanel } from './SetPanels';
import { SubReportReview } from './SubReportReview';
import { closeFrontPanel, setReview, stepInto, useWallNav } from './wall-nav';

export function WallView() {
  const { t } = useTranslation();
  const models = useViewerStore((s) => s.models);
  const legacy = useViewerStore((s) => s.geometryResult);
  const { geometryResult } = useDrawingRuntime();
  // The geometry arrives in batches: the starting set is laid out from the whole model, never from its first batch (#313).
  const streaming = useViewerStore((s) => s.geometryStreamingActive);
  const meshes = streaming ? null : geometryResult?.meshes ?? null;
  const sheets = useProjectStore((s) => s.sheets);
  const views = useProjectStore((s) => s.views);
  const levels = useProjectStore((s) => s.levels);
  // Measured in a task of its own (#154): framing the building reads every element's box (about 40 ms on a large model),
  // and the model's arrival lands in the same render that finishes the 3D, which made one long task of it. The set is laid
  // out from the same settled meshes as the extent, so it always starts from a matching pair.
  const settled = useNextTaskValue(useMemo(() => ({ levels, meshes, models, legacy }), [levels, meshes, models, legacy]));
  // Measured on the building, not on the site around it; the main body of the model when no storey holds geometry.
  const extent = useMemo(() => setExtent(settled.levels, settled.meshes, mergedSectionBounds(settled.models, settled.legacy)).extent, [settled]);
  const settledMeshes = settled.meshes;
  const [intro, setIntro] = useState(false);
  const { stepped, focus, visit, panel, review } = useWallNav();

  // A model on a project with no set sheets (interior elevations alone do not count): lay the set out as soon as the geometry is in.
  const hasSet = sheets.some(isSetSheet);
  useEffect(() => {
    if (!hasSet && settledMeshes && settledMeshes.length > 0 && startSet(settledMeshes, extent)) setIntro(true);
  }, [hasSet, settledMeshes, extent]);

  // The proposals read the lowest plan's rooms; they change only with the model or the plans.
  const proposals = useMemo(() => sectionProposals(settledMeshes, extent), [settledMeshes, extent, views]);
  const back = useCallback(() => stepInto(null), []);
  // Hanging goes by the event, so the tour can hang the set too (its steps skip the intro the same way).
  const hang = useCallback(() => emitWallHung(), []);
  useEffect(() => {
    const onHung = () => setIntro(false);
    window.addEventListener(EVENT_WALL_HUNG, onHung);
    return () => window.removeEventListener(EVENT_WALL_HUNG, onHung);
  }, []);
  const steppedSheet = sheets.find((s) => s.id === stepped) ?? null;
  const modelName = [...models.values()][0]?.name ?? '';

  return (
    <div className="relative h-full w-full overflow-hidden bg-[radial-gradient(ellipse_at_top,#0c2a52,#061a36_60%)] text-sky-50">
      {models.size === 0 && !legacy ? (
        <div className="flex h-full flex-col items-center justify-center gap-5 text-base text-sky-200/80">
          <p className="m-0">{t('wall.empty')}</p>
          <button type="button" className="rounded-md bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-500" onClick={() => void openDemoModel().catch((err: unknown) => console.warn('[ifcsheet] could not open the demo project', err))}>
            {t('wall.demo')}
          </button>
          <NewFromTemplate />
        </div>
      ) : sheets.length === 0 ? (
        <div className="flex h-full items-center justify-center text-base text-sky-200/80">{t('wall.intro.waiting')}</div>
      ) : intro && extent ? (
        <WallIntro modelName={modelName} extent={extent} onHang={hang} />
      ) : steppedSheet ? (
        <SteppedSheet key={`${steppedSheet.id}:${visit}`} sheet={steppedSheet} extent={extent} proposals={proposals} initialFocus={focus} onBack={back} onStep={(id) => stepInto(id)} />
      ) : (
        <WallGrid extent={extent} onStep={(id) => stepInto(id)} />
      )}
      <WallCompare />
      {panel === 'drawer' ? <ProjectDrawer extent={extent} onClose={closeFrontPanel} /> : null}
      {review ? <SubReportReview scheduleId={review} onClose={() => setReview(null)} /> : null}
      {panel === 'missing' ? <MissingPanel /> : panel === 'issue' ? <IssuePanel /> : null}
    </div>
  );
}
