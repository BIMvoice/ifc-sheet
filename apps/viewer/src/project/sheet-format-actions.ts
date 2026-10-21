/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Changing a sheet's paper, orientation or frame, and fitting its drawings to it. One store write over `sheet-refit.ts`. */

import { runAsOneUndoStep } from '@/drafting/draft-store';
import type { ModelExtent } from './drawing-set';
import { paperMm } from './paper';
import { frameOf, frameProblem, type FrameProblem } from './sheet-frame';
import { refittedOnPaper, type BoxOf } from './sheet-refit';
import { updateProjectView, useProjectStore } from './project-store';
import type { ProjectSheet } from './types';

const state = () => useProjectStore.getState();

/** What a sheet's paper, orientation and frame can be changed to. A `templateId` of `null` says the sheet no longer follows a template. */
export type SheetFormatPatch = Partial<Pick<ProjectSheet, 'paper' | 'orientation' | 'frame'>> & { templateId?: string | null };

/**
 * Change a sheet's paper, orientation or frame, and fit its drawings to it
 * (`refittedOnPaper`): a new paper or orientation, or a viewport that no
 * longer fits, lays them out again at the scale that fits, the starting
 * set's own path; a margin or title block change keeps each viewport's
 * position, box and scale and only brings it inside the drawing area. A
 * view's scale is written back only when the sheet was laid out again. One
 * undo step. Without the model's extent nothing is laid out again, but every
 * viewport is still brought inside. `boxOf` is each viewport's box as the
 * sheet draws it (a schedule's or legend's own size); without it the box is
 * estimated (`estimatedBox`).
 *
 * A paper and frame that cannot hold the title block (`frameProblem`) are
 * refused: the sheet is left as it was and the problem is returned; null
 * when the change was made.
 */
export function setSheetFormat(sheetId: string, patch: SheetFormatPatch, extent: ModelExtent | null, boxOf?: BoxOf): FrameProblem | null {
  const { sheets, views } = state();
  const sheet = sheets.find((s) => s.id === sheetId);
  if (!sheet) return null;
  const { templateId: patched, ...fields } = patch;
  const { templateId: kept, ...rest } = sheet;
  const templateId = patched === undefined ? kept : patched ?? undefined;
  const changed: ProjectSheet = { ...rest, ...fields, ...(templateId ? { templateId } : {}) };
  const problem = frameProblem(paperMm(changed.paper ?? 'A1', changed.orientation), frameOf(changed));
  if (problem) return problem;
  const { sheet: fitted, relaid } = refittedOnPaper(sheet, changed, views, extent, boxOf);
  runAsOneUndoStep(() => {
    useProjectStore.setState({ sheets: sheets.map((s) => (s.id === sheetId ? fitted : s)), dirty: true });
    if (!relaid) return;
    // A view's annotation sizes follow the scale it is drawn at (as when the scale is typed on the Wall).
    for (const vp of fitted.viewports ?? []) {
      const view = views.find((v) => v.id === vp.viewId);
      const was = sheet.viewports?.find((o) => o.id === vp.id)?.scale;
      if (view && was !== vp.scale) updateProjectView(view.id, { scale: vp.scale });
    }
  });
  return null;
}
