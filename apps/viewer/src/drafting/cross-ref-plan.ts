/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The cross-reference marks a plan prints on the app's sheet: the engine's `crossReferenceMarks` (#619), the same code the PDF, the DXF and
 * `ifcsheet build` place them with, measured with the browser's font and the plan's screen, and kept per input so a viewport's marks
 * are placed once however often the sheet asks for them.
 */

import { crossReferenceMarks, overlayObstacleBoxes, type MarkStyle } from '@bimvoice/ifcsheet';
import type { ProjectSheet, ProjectView, SheetViewport } from '@/project/types';
import { fitExtent } from '@/project/sheets';
import type { PlanOverlay } from '@/project/plan-overlays';
import { withAnnotationScreenUp } from './annotation';
import { textWidthEm } from './text-width';
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
  /** How section and elevation marks are headed (the project's graphic standard, #447); absent: the arrow. */
  markStyle?: MarkStyle;
  /** The turn the plan is drawn at (`turnOf` its drawing's plane): its elevation marks face their elevations through it, as the engine's. */
  turn?: number;
}

/**
 * What {@link withCrossReferences} returned for each input object: a mark is placed by its text box, and a
 * text box is measured with the input's own `screenUp`, so the input alone is the key.
 * A sheet asks for a viewport's marks three times a render (what it draws, the extent it fits and the
 * box it frames) and on every render after, so it hands the same input each time and the marks are
 * placed once (#154). An input is never changed after it is made.
 */
const placed = new WeakMap<PlanCrossRefInput, DraftEntity[]>();

/** `drafts` with the section references and elevation marks of a plan added; any other view's drafts unchanged. */
export function withCrossReferences(input: PlanCrossRefInput): DraftEntity[] {
  let out = placed.get(input);
  if (!out) placed.set(input, out = withAnnotationScreenUp(input.screenUp, () => placeCrossReferences(input)));
  return out;
}

function placeCrossReferences(input: PlanCrossRefInput): DraftEntity[] {
  const marks = crossReferenceMarks({ ...input, symbols: overlayObstacleBoxes(input.overlays ?? []), measure: { widthOf: textWidthEm, frame: { up: input.screenUp, right: 1 } } });
  return marks.length ? [...input.drafts, ...marks] : [...input.drafts];
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
