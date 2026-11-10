/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Switching a plan between "Square to the building" and "True north" (`PlanProjectView.orientation`). Drafts live in
 * the view's drawing metres, so the switch turns every draft of the plan about the drawing origin by the change in the
 * plan's turn, in the same undo step as the new orientation: nothing drafted moves relative to the model
 * (`drawingToWorld` of a draft's points is the same before and after).
 */

import { planTurn } from '@bimvoice/ifcsheet';
import { currentDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { draftsOfView, runAsOneUndoStep } from '@/drafting/draft-store';
import { rotateDrafts } from '@/drafting/commands/modify';
import { updateProjectView, useProjectStore } from './project-store';
import type { PlanProjectView } from './types';

type PlanOrientation = NonNullable<PlanProjectView['orientation']>;

/** Whether `view` can be switched: a plan that is not the site plan (always true north) while the model it is drawn from is open. */
export function canSwitchPlanOrientation(view: PlanProjectView): boolean {
  return view.site !== true && currentDrawingRuntime().geometryResult != null;
}

/** The orientation `view` is drawn at: a plan without the field is on true north. */
export function orientationOf(view: PlanProjectView): PlanOrientation {
  return view.orientation === 'building' ? 'building' : 'true-north';
}

/** Draw the plan `viewId` at `orientation`, its drafts turned with it as one undo step. False when it cannot be switched (no such plan, a site plan, no model open). */
export function setPlanOrientation(viewId: string, orientation: PlanOrientation): boolean {
  const view = useProjectStore.getState().views.find((v): v is PlanProjectView => v.id === viewId && v.kind === 'plan');
  if (!view || !canSwitchPlanOrientation(view)) return false;
  if (orientationOf(view) === orientation) return true;
  const rotation = currentDrawingRuntime().geometryResult?.coordinateInfo?.buildingRotation;
  const change = planTurn({ ...view, orientation }, rotation) - planTurn(view, rotation);
  runAsOneUndoStep(() => {
    updateProjectView(viewId, { orientation });
    if (change !== 0) rotateDrafts(draftsOfView(viewId), { x: 0, y: 0 }, change);
  });
  return true;
}
