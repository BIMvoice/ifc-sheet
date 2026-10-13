/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The Wall: the drawing set as one surface. When a model opens on a project
 * with no sheets, the set is laid out at once (`startDrawingSet`) and the
 * model's arrival is announced; then every sheet hangs in view, and one can be
 * stepped into to be corrected where it hangs.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/i18n';
import { useDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { mergedSectionBounds } from '@/lib/section/section-distance';
import { sectionProposals, startDrawingSet } from '@/project/drawing-set-actions';
import { buildingExtent } from '@/project/model-rooms';
import { useProjectStore } from '@/project/project-store';
import { useViewerStore } from '@/store';
import { SteppedSheet } from './SteppedSheet';
import { WallGrid } from './WallGrid';
import { WallIntro } from './WallIntro';

export function WallView() {
  const { t } = useTranslation();
  const models = useViewerStore((s) => s.models);
  const legacy = useViewerStore((s) => s.geometryResult);
  const { geometryResult } = useDrawingRuntime();
  const meshes = geometryResult?.meshes ?? null;
  const sheets = useProjectStore((s) => s.sheets);
  const views = useProjectStore((s) => s.views);
  const levels = useProjectStore((s) => s.levels);
  // Measured on the building, not on the site around it; the whole model when it has no storeys.
  const extent = useMemo(() => buildingExtent(levels, meshes) ?? mergedSectionBounds(models, legacy), [levels, meshes, models, legacy]);
  const [intro, setIntro] = useState(false);
  const [stepped, setStepped] = useState<string | null>(null);

  // A model on a project with no sheets: lay the set out as soon as the geometry is in.
  useEffect(() => {
    if (sheets.length === 0 && meshes && meshes.length > 0 && startDrawingSet(meshes, extent)) setIntro(true);
  }, [sheets.length, meshes, extent]);

  // The proposals read the lowest plan's rooms; they change only with the model or the plans.
  const proposals = useMemo(() => sectionProposals(meshes, extent), [meshes, extent, views]);
  const back = useCallback(() => setStepped(null), []);
  const hang = useCallback(() => setIntro(false), []);
  const steppedSheet = sheets.find((s) => s.id === stepped) ?? null;
  const modelName = [...models.values()][0]?.name ?? '';

  return (
    <div className="h-full w-full overflow-hidden bg-[radial-gradient(ellipse_at_top,#0c2a52,#061a36_60%)] text-sky-50">
      {models.size === 0 && !legacy ? (
        <div className="flex h-full items-center justify-center text-lg text-sky-200/80">{t('wall.empty')}</div>
      ) : sheets.length === 0 ? (
        <div className="flex h-full items-center justify-center text-lg text-sky-200/80">{t('wall.intro.waiting')}</div>
      ) : intro && extent ? (
        <WallIntro modelName={modelName} extent={extent} onHang={hang} />
      ) : steppedSheet ? (
        <SteppedSheet sheet={steppedSheet} extent={extent} proposals={proposals} onBack={back} />
      ) : (
        <WallGrid extent={extent} onStep={setStepped} />
      )}
    </div>
  );
}
