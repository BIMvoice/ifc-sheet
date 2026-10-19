/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a sheet's viewports show: each placed view's drawing styled by its own
 * graphics (door and window symbols, roofs and membranes on plans), its
 * drafts with level marks read now, and the schedules, road drawings and
 * legends placed beside them. The sheet editor and the Wall's sheets both
 * draw through this, so a sheet looks the same wherever it hangs.
 */

import { useCallback, useMemo } from 'react';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { useProjectStore } from '@/project/project-store';
import { useViewerStore } from '@/store';
import { viewportBox } from '@/project/sheets';
import { EMPTY_VIEW_DRAWING, useViewDrawings } from '@/project/view-drawings';
import { draftsOfView } from '@/drafting/draft-store';
import { settleLevelDrafts } from '@/drafting/level-sync';
import { levelResolverFor } from '@/drafting/level-resolver';
import type { ProjectSheet, SheetViewport } from '@/project/types';
import { hiddenClasses, styledDrawing } from '@/project/view-graphics';
import { partHostType } from '@/project/part-host';
import { drawnBySymbol } from '@/project/view-symbols';
import { viewMaterials } from '@/project/material-resolver';
import { membraneOverlays } from '@/project/membrane-overlays';
import { planOverlays, type PlanOverlay } from '@/project/plan-overlays';
import { useDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { entityStyles } from '@/project/model-styles';
import { useSheetSchedules } from '../joinery/ScheduleGraphic';
import { useSheetCivilDrawings } from '../civil/CivilDrawingGraphic';
import { useSheetLegends } from '../legend/LegendGraphic';
import type { ViewportContent } from './SheetPaper';

export interface SheetContent {
  content: (vp: SheetViewport) => ViewportContent;
  /** A viewport's box on the paper, mm. */
  boxOf: (vp: SheetViewport) => { width: number; height: number };
}

export function useSheetContent(sheet: ProjectSheet): SheetContent {
  const views = useProjectStore((s) => s.views);
  const drafts = useProjectStore((s) => s.drafts);
  const byView = useViewDrawings((s) => s.byView);
  // Each placed view as its own graphics style it: styled drawing and (plans) door / window symbols and roofs.
  const flips = useProjectStore((s) => s.symbolFlips);
  // Door and window symbols follow the catalogue and the symbol mapping.
  const joineryTypes = useProjectStore((s) => s.joineryTypes);
  const joineryMapping = useProjectStore((s) => s.joineryMapping);
  const materialsTable = useProjectStore((s) => s.materials);
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  const { geometryResult } = useDrawingRuntime();
  // Linked models in their own style (#96): follows the loaded models and the project's model list.
  const loadedModels = useViewerStore((s) => s.models);
  const projectModels = useProjectStore((s) => s.models);
  const styleOf = useMemo(() => entityStyles(useViewerStore.getState(), projectModels), [loadedModels, projectModels]);
  const styled = useMemo(() => {
    const out = new Map<string, { drawing: Drawing2D | null; overlays: PlanOverlay[] }>();
    for (const vp of sheet.viewports ?? []) {
      if (out.has(vp.viewId)) continue;
      const view = views.find((v) => v.id === vp.viewId);
      const raw = (byView[vp.viewId] ?? EMPTY_VIEW_DRAWING).drawing;
      const drawing = raw ? styledDrawing(raw, view?.graphics, partHostType, view?.kind === 'plan' ? drawnBySymbol : undefined, viewMaterials(raw)) : null;
      const overlays = [...(view && raw ? planOverlays(view, raw.config.plane, geometryResult?.meshes, flips, hiddenClasses(view.graphics), raw) : []), ...membraneOverlays(drawing)];
      out.set(vp.viewId, { drawing, overlays });
    }
    return out;
  }, [sheet.viewports, views, byView, geometryResult, flips, mutationVersion, materialsTable, joineryTypes, joineryMapping]);
  const placedSchedules = useSheetSchedules(sheet);
  const placedCivil = useSheetCivilDrawings(sheet);
  // A mark prints the number its reference reads now, not the one cached when the view was last open.
  const levels = useProjectStore((s) => s.levels);
  const settledDrafts = useCallback((viewId: string) => {
    const view = views.find((v) => v.id === viewId);
    const own = draftsOfView(viewId, drafts);
    return view ? settleLevelDrafts(own, levelResolverFor(view, levels, byView[viewId]?.drawing?.config.plane)) : own;
  }, [views, drafts, levels, byView]);
  const placedLegends = useSheetLegends(sheet);
  const content = useCallback((vp: SheetViewport): ViewportContent => ({
    schedule: placedSchedules.get(vp.viewId),
    civil: placedCivil.get(vp.viewId),
    legend: placedLegends.get(vp.viewId),
    view: views.find((v) => v.id === vp.viewId),
    drawing: styled.get(vp.viewId)?.drawing ?? null,
    drafts: settledDrafts(vp.viewId),
    overlays: styled.get(vp.viewId)?.overlays,
    styleOf,
  }), [views, styled, settledDrafts, placedSchedules, placedCivil, placedLegends, styleOf]);

  const boxOf = useCallback((v: SheetViewport) => {
    const placed = placedSchedules.get(v.viewId) ?? placedCivil.get(v.viewId) ?? placedLegends.get(v.viewId);
    return placed ? { width: placed.width, height: placed.height } : viewportBox(v, byView[v.viewId]?.drawing?.bounds ?? null);
  }, [placedSchedules, placedCivil, placedLegends, byView]);
  return { content, boxOf };
}
