/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a sheet's viewports show: each placed view's drawing styled by its own
 * graphics (door and window symbols, roofs and membranes on plans), its
 * drafts with level marks read now and the cross-reference marks (a section's
 * "1 / A-301", the ground plan's elevation marks) made from the sheets as they
 * are now, and the schedules, road drawings and
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
import { isRasterView } from '@/project/axonometric';
import { isAutosaveRasterRef } from '@/project/autosave-rasters';
import { drawingNumbers } from '@/drafting/cross-ref';
import { elevationMarkDrafts, elevationMarkPlan, obstacleBoxes, sectionReferenceDrafts } from '@/drafting/cross-ref-marks';
import { annotationFactor, viewportPaperUnit } from '@/project/viewport-annotation';
import type { ProjectSheet, ProjectView, SheetViewport, ViewRaster } from '@/project/types';
import { hiddenClasses, styledDrawing } from '@/project/view-graphics';
import { partHostType } from '@/project/part-host';
import { viewOmits } from '@/project/discipline-facts';
import { viewMaterials } from '@/project/material-resolver';
import { membraneOverlays } from '@/project/membrane-overlays';
import { planOverlays, type PlanOverlay } from '@/project/plan-overlays';
import { useDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { entityStyles } from '@/project/model-styles';
import { useSheetSchedules } from '../joinery/ScheduleGraphic';
import { useSheetCivilDrawings } from '../civil/CivilDrawingGraphic';
import { useSheetLegends } from '../legend/LegendGraphic';
import type { ViewportContent } from './SheetPaper';
import { siteBounds, useSheetSite } from '../siteplan/useSheetSite';

/** The raster capture a 3D view prints as, when it prints as one and has been captured (and, after an autosave restore, read back). */
function rasterOf(view: ProjectView | undefined): ViewRaster | undefined {
  const raster = view && isRasterView(view) ? view.raster ?? undefined : undefined;
  return raster && !isAutosaveRasterRef(raster.href) ? raster : undefined;
}

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
      const drawing = raw ? styledDrawing(raw, view?.graphics, partHostType, viewOmits(view), viewMaterials(raw)) : null;
      const overlays = [...(view && raw ? planOverlays(view, raw.config.plane, geometryResult?.meshes, flips, hiddenClasses(view.graphics), raw, vp.scale) : []), ...membraneOverlays(drawing)];
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
  // A site plan's plot and footprint; its viewport fits and centres on the whole plot (`siteBounds`).
  const rawDrawing = useCallback((viewId: string) => byView[viewId]?.drawing ?? null, [byView]);
  const placedViewIds = useMemo(() => (sheet.viewports ?? []).map((vp) => vp.viewId), [sheet.viewports]);
  const sites = useSheetSite(placedViewIds, views, drafts, rawDrawing);
  const siteDrawing = useCallback((viewId: string): Drawing2D | null => {
    const drawing = styled.get(viewId)?.drawing ?? null;
    const site = sites.get(viewId);
    return drawing && site?.boundary ? { ...drawing, bounds: siteBounds(drawing.bounds, site) } : drawing;
  }, [styled, sites]);
  // Cross-references are derived here, at draw time, from the sheets as they are: nothing of them is stored on the plan.
  const sheets = useProjectStore((s) => s.sheets);
  const viewIds = useMemo(() => new Set(views.map((v) => v.id)), [views]);
  const numbers = useMemo(() => drawingNumbers(sheet, viewIds), [sheet, viewIds]);
  const ground = useMemo(() => elevationMarkPlan(views), [views]);
  const draftsFor = useCallback((vp: SheetViewport) => {
    const own = settledDrafts(vp.viewId);
    const view = views.find((v) => v.id === vp.viewId);
    const sections = view?.kind === 'plan' ? sectionReferenceDrafts(own, views, sheets) : [];
    const bounds = byView[vp.viewId]?.drawing?.bounds;
    const withSections = sections.length ? [...own, ...sections] : own;
    const elevations = view && view.id === ground?.id && bounds
      ? elevationMarkDrafts({ planViewId: view.id, layerId: '0', views, sheets, bounds, paperUnit: viewportPaperUnit(vp.scale), factor: annotationFactor(vp.scale, view.scale), obstacles: obstacleBoxes(withSections) })
      : [];
    return elevations.length ? [...withSections, ...elevations] : withSections;
  }, [settledDrafts, views, sheets, byView, ground]);
  const content = useCallback((vp: SheetViewport): ViewportContent => ({
    schedule: placedSchedules.get(vp.viewId),
    civil: placedCivil.get(vp.viewId),
    legend: placedLegends.get(vp.viewId),
    view: views.find((v) => v.id === vp.viewId),
    raster: rasterOf(views.find((v) => v.id === vp.viewId)),
    drawing: siteDrawing(vp.viewId),
    drafts: draftsFor(vp),
    drawingNumber: numbers.get(vp.id),
    overlays: styled.get(vp.viewId)?.overlays,
    site: vp.keyPlanOf ? undefined : sites.get(vp.viewId),
    styleOf,
  }), [views, styled, draftsFor, numbers, placedSchedules, placedCivil, placedLegends, siteDrawing, sites, styleOf]);

  const boxOf = useCallback((v: SheetViewport) => {
    const placed = placedSchedules.get(v.viewId) ?? placedCivil.get(v.viewId) ?? placedLegends.get(v.viewId);
    const drawing = byView[v.viewId]?.drawing;
    return placed ? { width: placed.width, height: placed.height } : viewportBox(v, drawing ? siteBounds(drawing.bounds, sites.get(v.viewId)) : null);
  }, [placedSchedules, placedCivil, placedLegends, byView, sites]);
  return { content, boxOf };
}
