/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The cross-reference marks a plan prints, put together the one way a sheet and a test both do it: a section's "1 / A-301" beside
 * its letter and, on the ground plan, an elevation mark on each side of the building, each placed clear of the plan's drafts, of
 * its door and window symbols (the swings reach past the wall) and of the marks placed before it. Pure (#619).
 */

import type { ProjectSheet, ProjectView } from '../document.js';
import type { DimAllMeasure } from '../dimall/measure.js';
import type { DraftEntity, Pt } from '../draft-types.js';
import type { MarkStyle } from '../graphic-standard.js';
import { annotationFactor, viewportPaperUnit } from '../viewport-annotation.js';
import { obstacleBoxes, type CrossRefBox } from './boxes.js';
import { elevationMarkDrafts, elevationMarkPlan, markedElevation, MARK_MARGIN_MM } from './elevation-marks.js';
import { namedSections, sectionReferenceDrafts } from './section-marks.js';

export interface PlanCrossRefs {
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
  /** What the plan draws over its cut that a mark keeps clear of: its door and window symbols (`overlayObstacleBoxes`, `openingObstacles`). */
  symbols?: readonly CrossRefBox[];
  /** How a text is measured and which way the plan's screen runs (a plan: up -1). */
  measure: DimAllMeasure;
  /** How section and elevation marks are headed (the project's graphic standard, #447); absent: the arrow. */
  markStyle?: MarkStyle | undefined;
  /** The turn the plan is drawn at (`DrawingPlane.turn`, `turnOf`): its elevation marks face their elevations through it. */
  turn?: number;
}

/** The marks alone: the section references and elevation marks of a plan, each with an id ending `~xref`. Any other view's: none. */
export function crossReferenceMarks(input: PlanCrossRefs): DraftEntity[] {
  const { drafts, view, views, sheets, groundPlanId, bounds, viewportScale, measure } = input;
  const symbols = input.symbols ?? [];
  const sections = view?.kind === 'plan' ? sectionReferenceDrafts(drafts, views, sheets, { measure, obstacles: symbols, paperUnit: viewportPaperUnit(viewportScale), factor: annotationFactor(viewportScale, view.scale), markStyle: input.markStyle }) : [];
  const withSections = sections.length ? [...drafts, ...sections] : [...drafts];
  // An elevation mark stands outside the building's extent, so what lies wholly inside it, a margin in, cannot be in its way.
  const reach = MARK_MARGIN_MM * viewportPaperUnit(viewportScale);
  const outside = (b: CrossRefBox): boolean => !bounds
    || b.x0 < bounds.min.x + reach || b.y0 < bounds.min.y + reach || b.x1 > bounds.max.x - reach || b.y1 > bounds.max.y - reach;
  const elevations = view && view.id === groundPlanId && bounds
    ? elevationMarkDrafts({
      measure, planViewId: view.id, layerId: '0', views, sheets, bounds, paperUnit: viewportPaperUnit(viewportScale),
      factor: annotationFactor(viewportScale, view.scale), obstacles: [...obstacleBoxes(withSections, measure), ...symbols.filter(outside)], markStyle: input.markStyle, turn: input.turn,
    })
    : [];
  return [...sections, ...elevations];
}

/**
 * The views whose "n / sheet" the marks on plan `planViewId` print: the sections its section letters name and, on the plan
 * that carries them, every marked elevation. What a sheet holding the plan changes with when another sheet is renumbered.
 */
export function viewsNamedOnPlan(planViewId: string, planDrafts: readonly DraftEntity[], views: readonly ProjectView[]): string[] {
  const ids = new Set(namedSections(planDrafts, views));
  if (elevationMarkPlan(views)?.id === planViewId) for (const v of views) if (markedElevation(v)) ids.add(v.id);
  return [...ids].sort();
}
