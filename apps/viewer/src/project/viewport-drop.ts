/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Placing a view on a sheet by dropping it there (#168, the flagship flow). While a view not yet on the sheet is
 * dragged over the paper, its outline shows at its true size on the paper: the model's extent as the view sees it,
 * at the view's scale, the same box the set's own layout reserves for it (`viewExtent`). The outline snaps exactly as
 * a viewport being moved does (`viewport-snap.ts`), with the same guides. Letting go places the view there, framed
 * the way the set frames one it hangs (`placeViewports`: centred on the model's extent), as ONE undo step.
 */

import { runAsOneUndoStep } from '@/drafting/draft-store';
import { viewCentre, viewExtent, type ModelExtent } from './drawing-set';
import { addViewport, paperOf, updateViewport } from './sheets';
import { snapMove, snapTargets, type SnapBox, type SnapLine } from './viewport-snap';
import type { ProjectSheet, ProjectView } from './types';

/** The drag's data type: a view's id, dragged from the list of what is not on the sheet yet. */
export const PLACE_DRAG_TYPE = 'application/x-ifcsheet-place-view';

/** Where a dragged view would land: its outline's centre and size on the paper (mm), its scale, and the snap guides it sits on. */
export interface DropPreview extends SnapBox {
  scale: number;
  guides: SnapLine[];
}

/** Whether `view` can be dropped with an outline at true size: a view the model's extent sizes (a plan, an elevation, a section, a detail), not a 3D view, a drafting view or a site plan, which size themselves otherwise. */
export function dropsAtTrueSize(view: ProjectView): boolean {
  return view.kind === 'elevation' || view.kind === 'section' || (view.kind === 'plan' && !view.site);
}

/** The scale a dropped view is drawn at: its own, else that of the first drawing on the sheet, else 1:100 (as a click to place does). */
export function dropScale(view: Pick<ProjectView, 'scale'>, sheet: Pick<ProjectSheet, 'viewports'>): number {
  return view.scale ?? sheet.viewports?.[0]?.scale ?? 100;
}

/** The view's box on the paper at `scale`, mm: what it covers of the model, at true size. */
export function dropSize(view: ProjectView, extent: ModelExtent, scale: number): { width: number; height: number } {
  const { w, h } = viewExtent(view, extent);
  const k = 1000 / scale;
  return { width: w * k, height: h * k };
}

/**
 * The outline of `view` with its centre at `at` (paper mm) on `sheet`, snapped within `tol` mm to the frame, the
 * title block and `others` (the sheet's drawings, as drawn). Null when `at` is off the paper: nothing is placed there.
 */
export function dropPreview(sheet: ProjectSheet, view: ProjectView, extent: ModelExtent, others: readonly SnapBox[], at: { x: number; y: number }, tol: number): DropPreview | null {
  const paper = paperOf(sheet);
  if (!dropsAtTrueSize(view)) return null;
  if (at.x < 0 || at.y < 0 || at.x > paper.w || at.y > paper.h) return null;
  const scale = dropScale(view, sheet);
  const size = dropSize(view, extent, scale);
  const snapped = snapMove({ ...size, x: at.x, y: at.y }, snapTargets(sheet, others), tol);
  return { ...size, x: snapped.x, y: snapped.y, scale, guides: snapped.guides };
}

/** Place `view` on the sheet where `preview` shows it, framed as the set frames a view it hangs: ONE undo step. The new viewport's id. */
export function placeDropped(sheetId: string, view: ProjectView, preview: Pick<DropPreview, 'x' | 'y' | 'scale'>, extent: ModelExtent): string {
  let id = '';
  runAsOneUndoStep(() => {
    id = addViewport(sheetId, view.id, { x: preview.x, y: preview.y }, preview.scale);
    const center = viewCentre(view, extent);
    if (center) updateViewport(sheetId, id, { center });
  });
  return id;
}
