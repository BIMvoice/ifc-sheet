/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The drawing a drafting tab shows: the generated one with its terrain as contours broken under their height labels
 * (#182), its hidden elements left out and its plan symbols and detail level applied, as a sheet viewport does
 * (`useSheetContent`); and the contours' height labels over it, in the theme's ink (`project/contour-overlay.ts`, the
 * overlay the sheet and the DXF carry).
 */

import { memo, useMemo } from 'react';
import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { atDetailLevel, type DetailLevel, type resolveViewGraphics } from '@bimvoice/ifcsheet';
import type { SectionAxisName, ViewTransform } from '@/drafting/frame';
import { withViewPlanSymbols } from '@/project/plan-symbols';
import { withViewContours, type TerrainSource } from '@/project/view-contours';
import { contourOverlays } from '@/project/contour-overlay';
import { renderIdGlobalId } from '@/project/element-guid';
import { withoutHiddenElements } from '@/project/view-element-filter';
import { useSheetLocale } from '@/project/units-and-numbers';
import { DEFAULT_VIEW_SCALE } from '@/project/viewport-annotation';
import type { ProjectView } from '@/project/types';
import type { GeometryResult } from '@ifc-lite/geometry';
import { OverlayPaths } from '../sheets/OverlayPaths';

const scaleOf = (view: ProjectView): number => (view.scale && view.scale > 0 ? view.scale : DEFAULT_VIEW_SCALE);

/** `drawing` as the tab shows it. */
export function useViewDrawing(
  drawing: Drawing2D | null, view: ProjectView, models: ReadonlyMap<string, TerrainSource>, geometry: Pick<GeometryResult, 'meshes'> | null | undefined,
  graphics: ReturnType<typeof resolveViewGraphics>, detail: DetailLevel,
): Drawing2D | null {
  const locale = useSheetLocale();
  return useMemo(
    () => (drawing ? atDetailLevel(withViewPlanSymbols(withoutHiddenElements(withViewContours(drawing, view, models, geometry, { scale: scaleOf(view), locale }), graphics, renderIdGlobalId), view, graphics), detail) : null),
    [drawing, graphics, models, view, geometry, detail, locale],
  );
}

/** The contour height labels of a plan as overlays, for the live layer and the view's DXF. */
export function useContourOverlays(drawing: Drawing2D | null, view: ProjectView) {
  const locale = useSheetLocale();
  return useMemo(() => (view.kind === 'plan' ? contourOverlays(drawing, scaleOf(view), locale) : []), [drawing, view, locale]);
}

export const ContourLabelsLayer = memo(function ContourLabelsLayer({ overlays, view, transform, axis }: {
  overlays: ReturnType<typeof contourOverlays>; view: ProjectView; transform: ViewTransform; axis: SectionAxisName;
}) {
  if (overlays.length === 0) return null;
  // Paper millimetres to screen pixels at the view's scale.
  const paperMm = (transform.scale * scaleOf(view)) / 1000;
  return (
    <svg data-contour-labels className="absolute inset-0 h-full w-full pointer-events-none text-zinc-800 dark:text-zinc-200" aria-hidden="true">
      <OverlayPaths overlays={overlays} transform={transform} axis={axis} textScale={paperMm} ink="currentColor" />
    </svg>
  );
});
