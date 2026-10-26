/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The cross-reference marks a plan prints, put together the one way a sheet
 * and a test both do it: a section's "1 / A-301" beside its letter and, on
 * the ground plan, an elevation mark on each side of the building, each
 * placed clear of the plan's drafts, of its door and window symbols (the
 * swings reach past the wall) and of the marks placed before it. Pure.
 */

import type { ProjectSheet, ProjectView, SheetViewport } from '@/project/types';
import { fitExtent } from '@/project/sheets';
import type { PlanOverlay } from '@/project/plan-overlays';
import { annotationFactor, viewportPaperUnit } from '@/project/viewport-annotation';
import { withAnnotationScreenUp } from './annotation';
import { elevationMarkDrafts, MARK_MARGIN_MM, obstacleBoxes, overlayObstacleBoxes, sectionReferenceDrafts } from './cross-ref-marks';
import type { DraftEntity, Pt } from './types';

export interface PlanCrossRefInput {
  /** The plan's own drafts (level marks already settled). */
  drafts: readonly DraftEntity[];
  view: ProjectView | undefined;
  views: readonly ProjectView[];
  sheets: readonly ProjectSheet[];
  /** The plan that carries the elevation marks (`elevationMarkPlan`), if any. */
  groundPlanId: string | undefined;
  /** The plan's drawing extent, drawing metres. */
  bounds: { min: Pt; max: Pt } | undefined;
  /** The scale denominator of the viewport that shows the plan. */
  viewportScale: number;
  /** What the plan draws over its cut: its door and window symbols are kept clear of. */
  overlays?: readonly PlanOverlay[];
  /**
   * Which way is up on screen in the plan's drawing y (`viewScreenUp`: -1 on a plan). Every text box the marks are placed
   * against is measured with it, so the marks are a function of this input and not of the drafting session's current view.
   */
  screenUp: 1 | -1;
}

/** `drafts` with the section references and elevation marks of a plan added; any other view's drafts unchanged. */
export function withCrossReferences(input: PlanCrossRefInput): DraftEntity[] {
  return withAnnotationScreenUp(input.screenUp, () => placeCrossReferences(input));
}

function placeCrossReferences(input: PlanCrossRefInput): DraftEntity[] {
  const { drafts, view, views, sheets, groundPlanId, bounds, viewportScale } = input;
  const symbols = overlayObstacleBoxes(input.overlays ?? []);
  const sections = view?.kind === 'plan' ? sectionReferenceDrafts(drafts, views, sheets, { obstacles: symbols, paperUnit: viewportPaperUnit(viewportScale), factor: annotationFactor(viewportScale, view.scale) }) : [];
  const withSections = sections.length ? [...drafts, ...sections] : [...drafts];
  // An elevation mark stands outside the building's extent, so what lies wholly inside it, a margin in, cannot be in its way.
  const reach = MARK_MARGIN_MM * viewportPaperUnit(viewportScale);
  const outside = (b: { x0: number; y0: number; x1: number; y1: number }): boolean => !bounds
    || b.x0 < bounds.min.x + reach || b.y0 < bounds.min.y + reach || b.x1 > bounds.max.x - reach || b.y1 > bounds.max.y - reach;
  const elevations = view && view.id === groundPlanId && bounds
    ? elevationMarkDrafts({
      planViewId: view.id, layerId: '0', views, sheets, bounds, paperUnit: viewportPaperUnit(viewportScale),
      factor: annotationFactor(viewportScale, view.scale), obstacles: [...obstacleBoxes(withSections), ...symbols.filter(outside)],
    })
    : [];
  return elevations.length ? [...withSections, ...elevations] : withSections;
}

/**
 * The extent an auto-fit viewport frames, measured on the drafts the sheet
 * draws: the view's own drafts and the cross-references added to them, so a
 * mark lifted past the building's edge to clear a door swing is inside the
 * viewport and not clipped (#243). `fitBounds` is the drawing's bounds, plus
 * a site plan's plot.
 */
export function fitWithCrossReferences(vp: Pick<SheetViewport, 'width' | 'height' | 'scale'>, fitBounds: { min: Pt; max: Pt }, input: PlanCrossRefInput): { min: Pt; max: Pt } {
  // The extent measures the marks' text boxes too, so it is taken with the same screen-up they were placed with.
  return withAnnotationScreenUp(input.screenUp, () => fitExtent(vp, fitBounds, withCrossReferences(input), input.view?.scale));
}
