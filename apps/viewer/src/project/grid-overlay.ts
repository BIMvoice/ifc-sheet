/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The model's structural grid (IfcGrid) as a view's overlay: every axis a
 * thin dash-dot line past the building, with a circled bubble carrying its
 * AxisTag at the chosen ends. A plan draws the axes whole; a section or
 * elevation draws those that cross its plane, as verticals at the crossing,
 * bubbles at the head (and the foot). One overlay, so the live view, a sheet
 * viewport, the sheet SVG / PDF and the DXF (layer GRID) all carry it.
 *
 * Position is read, never inferred: `extractGridAxesForStorey` composes the
 * grid's ObjectPlacement chain up to the storey's frame exactly as it does a
 * wall's (`frameInStoreyFrame`) and applies the file's length-unit scale;
 * the storey workplane (`buildStoreyWorkplane`) then takes storey-local metres
 * to the render frame the drawing was cut in, the step the roof and corridor
 * overlays use. Overlays are derived from the live store on every call, so a
 * grid edited, moved or re-tagged follows; each axis is identified by its
 * grid's GlobalId and its tag (`ViewGridAxis.key`). A model with no IfcGrid is
 * skipped before any extraction, and the extracted axes are reused until the
 * store's `mutationVersion` (or the model's mutation view) changes.
 */

import type { Drawing2D, SectionPlaneConfig } from '@ifc-lite/drawing-2d';
import { extractGridAxesForStorey, type GridAxisSegment } from '@ifc-lite/create';
import type { IfcDataStore } from '@ifc-lite/parser';
import type { MutablePropertyView } from '@ifc-lite/mutations';
import { useViewerStore } from '@/store';
import { liveGraphics } from './view-graphics-live';
import { buildStoreyWorkplane } from '@/lib/commands/modeling/workplane';
import type { Workplane } from '@/lib/commands/modeling/types';
import type { Pt } from '@/drafting/types';
import { PEN } from '@/components/viewer/sheets/viewport-pens';
import { gridShapesOf, type ViewGridAxis } from '@bimvoice/ifcsheet';
import type { PlanOverlay } from './plan-overlays';
import type { GridEnds, ProjectView } from './types';
import { DEFAULT_VIEW_SCALE } from './viewport-annotation';

export type { ViewGridAxis };

type Vec3 = [number, number, number];

/** A view's grid settings with their defaults: on for plans and sections, off for elevations; bubbles at both ends. */
export function gridSettings(view: ProjectView): { visible: boolean; ends: GridEnds } {
  const g = liveGraphics(view)?.grid;
  return { visible: g?.visible ?? (view.kind === 'plan' || view.kind === 'section'), ends: g?.ends ?? 'both' };
}

type ExtractGridAxes = typeof extractGridAxesForStorey;
let extractAxes: ExtractGridAxes = extractGridAxesForStorey;

/**
 * Extracted storey axes, per model store, valid for one `mutationVersion` and
 * one mutation view. Extraction re-parses the spatial relationships from the
 * source bytes, so it runs once per storey per edit, not on every recompute.
 * Keyed by the store itself: a model reloaded under the same id is a new store.
 */
interface AxesMemo { version: number; view: MutablePropertyView | null; byStorey: Map<number, GridAxisSegment[]> }
let axesMemo = new WeakMap<IfcDataStore, AxesMemo>();

/** Swap the extractor (to count calls) and drop the memo; `null` restores the real one. */
export function setGridExtractorForTests(fn: ExtractGridAxes | null): void {
  extractAxes = fn ?? extractGridAxesForStorey;
  axesMemo = new WeakMap();
}

/** Whether the model can hold an IfcGrid at all: one parsed from the file, created this session, or retyped to one. */
function modelHasGrid(store: IfcDataStore, view: MutablePropertyView | null): boolean {
  if ((store.entityIndex?.byType.get('IFCGRID')?.length ?? 0) > 0) return true;
  if (!view) return false;
  if (!view.getNewEntitiesOfType('IFCGRID').next().done) return true;
  for (const { newType } of view.getTypeMutations().values()) if (newType.toUpperCase() === 'IFCGRID') return true;
  return false;
}

function storeyAxes(store: IfcDataStore, view: MutablePropertyView | null, storeyId: number, mutationVersion?: number): GridAxisSegment[] {
  if (mutationVersion === undefined) return extractAxes(store, storeyId, view ?? undefined).axes;
  let memo = axesMemo.get(store);
  if (!memo || memo.version !== mutationVersion || memo.view !== view) {
    memo = { version: mutationVersion, view, byStorey: new Map() };
    axesMemo.set(store, memo);
  }
  let axes = memo.byStorey.get(storeyId);
  if (!axes) {
    axes = extractAxes(store, storeyId, view ?? undefined).axes;
    memo.byStorey.set(storeyId, axes);
  }
  return axes;
}

/**
 * The axes of the grids that apply to one storey, in the render frame: storey-local metres through the storey workplane.
 * With `mutationVersion`, the extracted axes are reused until the model is edited.
 */
export function gridAxesInRender(
  store: IfcDataStore, view: MutablePropertyView | null, storeyId: number, workplane: Workplane, mutationVersion?: number,
): { axisId: number; axis: ViewGridAxis }[] {
  return storeyAxes(store, view, storeyId, mutationVersion).map((a) => ({
    axisId: a.axisId,
    axis: {
      key: `${store.entities.getGlobalId(a.gridId) || `#${a.gridId}`}:${a.AxisTag}`,
      tag: a.AxisTag,
      a: workplane.localToRender([a.a[0], a.a[1], 0]) as Vec3,
      b: workplane.localToRender([a.b[0], a.b[1], 0]) as Vec3,
    },
  }));
}

/** Every grid axis a view can draw, from the live store. A plan reads its own storeys; a section or elevation, every storey. */
export function viewGridAxes(view: ProjectView): ViewGridAxis[] {
  const s = useViewerStore.getState();
  const wanted = view.kind === 'plan' ? new Set(view.level.storeyGlobalIds) : new Set<string>();
  const out: ViewGridAxis[] = [];
  for (const [modelId, model] of s.models) {
    const store = model.ifcDataStore;
    const storeys = store?.spatialHierarchy?.storeyElevations;
    if (!store || !storeys) continue;
    const mv = s.mutationViews.get(modelId) ?? null;
    // No IfcGrid anywhere in the model: nothing to extract, and no storey walk.
    if (!modelHasGrid(store, mv)) continue;
    const seen = new Set<number>();
    for (const storeyId of [...storeys.keys()].sort((x, y) => (storeys.get(x) ?? 0) - (storeys.get(y) ?? 0))) {
      if (wanted.size && !wanted.has(store.entities.getGlobalId(storeyId) ?? '')) continue;
      const workplane = buildStoreyWorkplane(s, modelId, storeyId, 0);
      if ('refused' in workplane) continue;
      // One grid runs through every storey it serves: the lowest one draws it.
      for (const { axisId, axis } of gridAxesInRender(store, mv, storeyId, workplane, s.mutationVersion)) {
        if (!seen.has(axisId)) {
          seen.add(axisId);
          out.push(axis);
        }
      }
    }
  }
  return out;
}

/**
 * The overlays of `axes` in a view: GRID lines (dash-dot) and GRID bubbles (continuous, tag as text), the strokes the engine's
 * `gridShapesOf` makes (so headless annotate keeps labels off the same ones) on the view's pens. `unit` is model metres per
 * paper millimetre at the view's scale. A section runs its verticals from `bounds` (drawing coordinates) outward.
 */
export function gridOverlaysOf(
  axes: readonly ViewGridAxis[], kind: ProjectView['kind'], plane: SectionPlaneConfig, ends: GridEnds, unit: number,
  bounds?: { min: Pt; max: Pt } | null,
): PlanOverlay[] {
  const { lines, bubbles, texts } = gridShapesOf(axes, kind, plane, ends, unit, bounds);
  return [
    { layer: 'GRID', width: PEN.hatch, lineType: 'dashdot' as const, shapes: lines },
    { layer: 'GRID', width: PEN.seen, shapes: bubbles, texts },
  ].filter((o) => o.shapes.length);
}

/** The grid of a view as overlays (none when the view hides it or the model has no grid). `scale` is the denominator the drawing is shown at (a sheet viewport's); absent, the view's own. */
export function gridOverlays(view: ProjectView, plane: SectionPlaneConfig, drawing?: Drawing2D | null, scale?: number): PlanOverlay[] {
  const { visible, ends } = gridSettings(view);
  if (!visible || view.kind === '3d') return [];
  const axes = viewGridAxes(view);
  if (axes.length === 0) return [];
  return gridOverlaysOf(axes, view.kind, plane, ends, (scale && scale > 0 ? scale : view.scale && view.scale > 0 ? view.scale : DEFAULT_VIEW_SCALE) / 1000, drawing?.bounds);
}
