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

import { useCallback, useDeferredValue, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { atDetailLevel, markStyleOf, resolveDetailLevel, resolveViewGraphics } from '@bimvoice/ifcsheet';
import { useProjectStore } from '@/project/project-store';
import { useViewerStore } from '@/store';
import { registerViewportBoxes } from '@/project/sheet-viewport-boxes';
import { viewportBox } from '@/project/sheets';
import { useViewDrawings } from '@/project/view-drawings';
import { draftsOfView } from '@/drafting/draft-store';
import { settleLevelDrafts } from '@/drafting/level-sync';
import { levelResolverFor } from '@/drafting/level-resolver';
import { isRasterView } from '@/project/axonometric';
import { isAutosaveRasterRef } from '@/project/autosave-rasters';
import { drawingNumbers } from '@/drafting/cross-ref';
import { elevationMarkPlan } from '@/drafting/cross-ref-marks';
import { viewScreenUp } from '@/project/view-screen-up';
import { fitWithCrossReferences, withCrossReferences, type PlanCrossRefInput } from '@/drafting/cross-ref-plan';
import type { ProjectSheet, ProjectView, SheetViewport, ViewRaster } from '@/project/types';
import { hiddenClasses, styledDrawing } from '@/project/view-graphics';
import { renderIdGlobalId } from '@/project/element-guid';
import { withoutHiddenElementMeshes, withoutHiddenElements } from '@/project/view-element-filter';
import { schemeResultOf } from '@/project/view-colour-scheme';
import { withSurfaceFills } from '@/project/view-surface-fills';
import { phaseMeshes, phaseViewOf } from '@/project/phase-view';
import { partHostType } from '@/project/part-host';
import { viewOmits } from '@/project/discipline-facts';
import { viewMaterials } from '@/project/material-resolver';
import { membraneOverlays } from '@/project/membrane-overlays';
import { planOverlays, type PlanOverlay } from '@/project/plan-overlays';
import { withViewPlanSymbols } from '@/project/plan-symbols';
import { useDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { entityStyles } from '@/project/model-styles';
import { useSheetSchedules } from '../joinery/ScheduleGraphic';
import { useSheetCivilDrawings } from '../civil/CivilDrawingGraphic';
import { useSheetLegends } from '../legend/LegendGraphic';
import { useGraphicStandard } from '@/project/graphic-standard-actions';
import type { ViewportContent } from './SheetPaper';
import { memoOn, sharedMemo } from './shared-memo';
import { siteBounds, useSheetSite } from '../siteplan/useSheetSite';

/** The raster capture a 3D view prints as, when it prints as one and has been captured (and, after an autosave restore, read back). */
function rasterOf(view: ProjectView | undefined): ViewRaster | undefined {
  const raster = view && isRasterView(view) ? view.raster ?? undefined : undefined;
  return raster && !isAutosaveRasterRef(raster.href) ? raster : undefined;
}

interface StyledViewport { drawing: Drawing2D | null; overlays: PlanOverlay[] }

const styledMemo = sharedMemo<StyledViewport>();
const fittedMemo = sharedMemo<Drawing2D>();
const crossRefMemo = sharedMemo<PlanCrossRefInput>();

export interface SheetContent {
  content: (vp: SheetViewport) => ViewportContent;
  /** A viewport's box on the paper, mm. */
  boxOf: (vp: SheetViewport) => { width: number; height: number };
}

export interface SheetContentOptions {
  /**
   * Take a newly generated drawing in a deferred render (`useDeferredValue`), which React splits
   * into short tasks and lets input go first. For the Wall, where views land one by one while the
   * user scrolls (#154); a caller that reads the paper as soon as a view is ready (an issue's
   * capture, the sheet editor) keeps the default, which draws the drawing in the same render.
   */
  deferDrawings?: boolean;
}

export function useSheetContent(sheet: ProjectSheet, { deferDrawings = false }: SheetContentOptions = {}): SheetContent {
  const views = useProjectStore((s) => s.views);
  // The view templates (#44): a template edited redraws every viewport whose view follows it.
  const viewTemplates = useProjectStore((s) => s.viewTemplates);
  const drafts = useProjectStore((s) => s.drafts);
  // Only this sheet's drawings: a progress tick, or another sheet's view landing, leaves the sheet as it is (#154).
  const placedViewIds = useMemo(() => (sheet.viewports ?? []).map((vp) => vp.viewId), [sheet.viewports]);
  const liveDrawings = useViewDrawings(useShallow((s) => placedViewIds.map((id) => s.byView[id]?.drawing ?? null)));
  const deferredDrawings = useDeferredValue(liveDrawings);
  const sheetDrawings = deferDrawings ? deferredDrawings : liveDrawings;
  const drawingOf = useMemo(() => new Map(placedViewIds.map((id, i) => [id, sheetDrawings[i]])), [placedViewIds, sheetDrawings]);
  // Each placed view as its own graphics style it: styled drawing and (plans) door / window symbols and roofs.
  const flips = useProjectStore((s) => s.symbolFlips);
  const standard = useGraphicStandard();
  // Door and window symbols follow the catalogue and the symbol mapping.
  const joineryTypes = useProjectStore((s) => s.joineryTypes);
  const joineryMapping = useProjectStore((s) => s.joineryMapping);
  const materialsTable = useProjectStore((s) => s.materials);
  const phaseSource = useProjectStore((s) => s.phaseSource);
  const mutationVersion = useViewerStore((s) => s.mutationVersion);
  const { geometryResult } = useDrawingRuntime();
  // Linked models in their own style (#96): follows the loaded models and the project's model list.
  const loadedModels = useViewerStore((s) => s.models);
  const projectModels = useProjectStore((s) => s.models);
  const styleOf = useMemo(() => entityStyles(useViewerStore.getState(), projectModels), [loadedModels, projectModels]);
  // A viewport is styled again only when its own drawing, view or scale changed, or one of the shared inputs
  // did: views land one at a time and the others on the sheet keep what they had, and the sheet editor
  // reuses what the Wall styled (`styledMemo`, #154).
  const styled = useMemo(() => {
    const out = new Map<string, StyledViewport>();
    for (const vp of sheet.viewports ?? []) {
      if (out.has(vp.viewId)) continue;
      const view = views.find((v) => v.id === vp.viewId);
      const raw = drawingOf.get(vp.viewId) ?? null;
      const style = (): StyledViewport => {
        const graphics = resolveViewGraphics(view, viewTemplates);
        const phases = phaseViewOf(graphics, phaseSource);
        // What the view hides element by element (#33) is left out first, so no hatch, membrane or symbol is made for it.
        // The detail level (#444) at the viewport's scale, the function the headless sheets call (`sheetGraphic`).
        const detail = resolveDetailLevel(graphics, vp.scale);
        const kept = raw ? atDetailLevel(withViewPlanSymbols(withoutHiddenElements(raw, graphics, renderIdGlobalId), view, graphics), detail) : null;
        const symbolMeshes = withoutHiddenElementMeshes(phaseMeshes(geometryResult?.meshes, phases), graphics, renderIdGlobalId);
        const styledKept = kept ? styledDrawing(kept, graphics, partHostType, viewOmits(view), viewMaterials(kept), phases, schemeResultOf(view, kept, geometryResult?.meshes), renderIdGlobalId) : null;
        // The coloured style of an elevation or section (#499): the visible surfaces in the materials' colours, under the linework.
        const drawing = styledKept ? withSurfaceFills(styledKept, view, graphics, symbolMeshes, hiddenClasses(graphics), materialsTable ?? []) : null;
        const overlays = [...(view && kept ? planOverlays(view, kept.config.plane, symbolMeshes, flips, hiddenClasses(graphics), kept, vp.scale, standard.pens, detail) : []), ...membraneOverlays(drawing)];
        return { drawing, overlays };
      };
      out.set(vp.viewId, raw
        ? memoOn(styledMemo, raw, [view, viewTemplates, vp.scale, geometryResult, flips, mutationVersion, materialsTable, phaseSource, joineryTypes, joineryMapping, standard], style)
        : style());
    }
    return out;
  }, [sheet.viewports, views, viewTemplates, drawingOf, geometryResult, flips, mutationVersion, materialsTable, phaseSource, joineryTypes, joineryMapping, standard]);
  const placedSchedules = useSheetSchedules(sheet);
  const placedCivil = useSheetCivilDrawings(sheet);
  // A mark prints the number its reference reads now, not the one cached when the view was last open.
  const levels = useProjectStore((s) => s.levels);
  const settledDrafts = useCallback((viewId: string) => {
    const view = views.find((v) => v.id === viewId);
    const own = draftsOfView(viewId, drafts);
    return view ? settleLevelDrafts(own, levelResolverFor(view, levels, drawingOf.get(viewId)?.config.plane)) : own;
  }, [views, drafts, levels, drawingOf]);
  const placedLegends = useSheetLegends(sheet);
  // A site plan's plot and footprint; its viewport fits and centres on the whole plot (`siteBounds`).
  const rawDrawing = useCallback((viewId: string) => drawingOf.get(viewId) ?? null, [drawingOf]);
  const sites = useSheetSite(placedViewIds, views, drafts, rawDrawing);
  // Cross-references are derived here, at draw time, from the sheets as they are: nothing of them is stored on the plan.
  const sheets = useProjectStore((s) => s.sheets);
  const viewIds = useMemo(() => new Set(views.map((v) => v.id)), [views]);
  const numbers = useMemo(() => drawingNumbers(sheet, viewIds), [sheet, viewIds]);
  const ground = useMemo(() => elevationMarkPlan(views), [views]);
  // Section and elevation marks are headed as the project's graphic standard says (#447).
  const markStyle = markStyleOf(standard);
  // One input per view and scale while nothing it reads changes, so `withCrossReferences` places a viewport's marks once,
  // not once each for what is drawn, the fitted extent and the box (#154). The input is shared between sheets mounted at
  // different times (`crossRefMemo`): marks are in paper millimetres and do not depend on the zoom, so a sheet that
  // the Wall hangs as an outline and then draws again, or the sheet editor opening it, finds them already placed.
  const crossRefInput = useMemo(() => {
    return (vp: SheetViewport): PlanCrossRefInput => {
      const raw = drawingOf.get(vp.viewId) ?? null;
      const view = views.find((v) => v.id === vp.viewId);
      const overlays = styled.get(vp.viewId)?.overlays;
      const screenUp = viewScreenUp(vp.viewId);
      return memoOn(crossRefMemo, raw ?? view ?? views, [vp.viewId, vp.scale, screenUp, view, views, sheets, ground?.id, drafts, levels, raw, overlays, markStyle], () => ({
        drafts: settledDrafts(vp.viewId), view, views, sheets, groundPlanId: ground?.id,
        bounds: raw?.bounds, viewportScale: vp.scale, overlays, screenUp, markStyle,
      }));
    };
  }, [settledDrafts, views, sheets, drawingOf, ground, styled, drafts, levels, markStyle]);
  const draftsFor = useCallback((vp: SheetViewport) => withCrossReferences(crossRefInput(vp)), [crossRefInput]);
  // What an auto-fit viewport frames: the drawing, the plot of a site plan and the drafts the sheet draws, the cross-references included (#140, #243).
  // `content` (what is drawn and centred) and `boxOf` (the crop) both read it, so they cannot disagree.
  const fittedBounds = useCallback((vp: SheetViewport, bounds: Drawing2D['bounds']) => fitWithCrossReferences(vp, siteBounds(bounds, sites.get(vp.viewId)), crossRefInput(vp)), [sites, crossRefInput]);
  // The same refitted drawing object while its bounds are the same, so a viewport's pens (memoised on it) are kept.
  const siteDrawing = useCallback((vp: SheetViewport): Drawing2D | null => {
    const drawing = styled.get(vp.viewId)?.drawing ?? null;
    if (!drawing) return null;
    const bounds = fittedBounds(vp, drawing.bounds);
    if (bounds === drawing.bounds) return drawing;
    return memoOn(fittedMemo, drawing, [bounds.min.x, bounds.min.y, bounds.max.x, bounds.max.y], () => ({ ...drawing, bounds }));
  }, [styled, fittedBounds]);
  const content = useCallback((vp: SheetViewport): ViewportContent => ({
    schedule: placedSchedules.get(vp.viewId),
    civil: placedCivil.get(vp.viewId),
    legend: placedLegends.get(vp.viewId),
    view: views.find((v) => v.id === vp.viewId),
    raster: rasterOf(views.find((v) => v.id === vp.viewId)),
    drawing: siteDrawing(vp),
    drafts: draftsFor(vp),
    drawingNumber: numbers.get(vp.id),
    overlays: styled.get(vp.viewId)?.overlays,
    site: vp.keyPlanOf ? undefined : sites.get(vp.viewId),
    styleOf,
  }), [views, styled, draftsFor, numbers, placedSchedules, placedCivil, placedLegends, siteDrawing, sites, styleOf]);

  const boxOf = useCallback((v: SheetViewport) => {
    const placed = placedSchedules.get(v.viewId) ?? placedCivil.get(v.viewId) ?? placedLegends.get(v.viewId);
    const drawing = drawingOf.get(v.viewId);
    return placed ? ('fit' in placed && placed.fit ? { width: placed.fit.box.w, height: placed.fit.box.h } : { width: placed.width, height: placed.height }) : viewportBox(v, drawing ? fittedBounds(v, drawing.bounds) : null);
  }, [placedSchedules, placedCivil, placedLegends, drawingOf, fittedBounds]);
  // Code outside React (the legend placement) measures the sheet's viewports with this same box (#267).
  useEffect(() => registerViewportBoxes(sheet.id, boxOf), [sheet.id, boxOf]);
  return { content, boxOf };
}
