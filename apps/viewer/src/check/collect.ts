/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The project as the checks read it: the stores' views, sheets and drafts, and what a drawn plan shows. */

import { labelTargets } from '@/labels/label-all';
import { viewElements } from '@/labels/view-elements';
import { elementByGlobalId } from '@/project/element-label';
import { useProjectStore } from '@/project/project-store';
import { useViewDrawings } from '@/project/view-drawings';
import { roomsOfPlan } from '@/tagall/rooms';
import { currentDrawingRuntime } from '@/lib/drawing/drawing-runtime';
import { checkSet } from './findings';
import type { CheckInput, Finding, PlanElement } from './types';

/** The doors, windows and rooms a plan shows; null while the plan has no drawing (it has not been opened). */
function planElements(viewId: string): PlanElement[] | null {
  const { views, levels } = useProjectStore.getState();
  const view = views.find((v) => v.id === viewId);
  const entry = useViewDrawings.getState().byView[viewId];
  if (!view || view.kind !== 'plan' || entry?.status !== 'ready' || !entry.drawing) return null;
  const openings = labelTargets(viewElements(entry.drawing)).filter((t) => /^ifc(door|window)/i.test(t.className)).map((t) => ({ guid: t.guid, className: t.className }));
  // The rooms TAGALL would label, read the way it reads them.
  const rooms = roomsOfPlan(view, levels, currentDrawingRuntime().geometryResult).map((r) => ({ guid: r.guid, className: 'IfcSpace' }));
  return [...openings, ...rooms];
}

export function collectInput(): CheckInput {
  const { views, sheets, drafts, titleBlock, name } = useProjectStore.getState();
  return { views, sheets, drafts, titleBlock, projectName: name, planElements, elementExists: (guid) => elementByGlobalId(guid) !== null };
}

/** What is missing from the project as it stands. */
export const currentFindings = (): Finding[] => checkSet(collectInput());
