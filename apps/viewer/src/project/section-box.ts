/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The section box of a cut-away axonometric (#97): what the drawing's card changes about `cutaway.box`. Plain functions on the
 * project store, so the card and a test take the same path; each one is one undo step (`updateProjectView`). The box is in the
 * drawing frame, viewer metres (X east, Y up, Z south), exactly what the engine clips by (`cutawayClipOf`).
 */

import type { MeshData } from '@ifc-lite/geometry';
import type { AxonometricCutaway, SectionBox } from '@bimvoice/ifcsheet/axonometric';
import { buildingExtent } from './model-rooms';
import { updateProjectView, useProjectStore } from './project-store';
import { sameElevation } from './view-defaults';
import type { ProjectLevel, ThreeDProjectView } from './types';

export const BOX_AXES = ['x', 'y', 'z'] as const;
export type BoxAxis = (typeof BOX_AXES)[number];
export type BoxEnd = 'min' | 'max';

const viewOf = (id: string): ThreeDProjectView | undefined => {
  const v = useProjectStore.getState().views.find((x) => x.id === id);
  return v?.kind === '3d' ? v : undefined;
};

/** The box of `level`'s extent (the whole building when the view has no storey), or `null` when there is no geometry to measure yet. */
export function storeyBox(level: ProjectLevel | undefined, levels: readonly ProjectLevel[], meshes: MeshData[] | null): SectionBox | null {
  const loaded = level ? levels.find((l) => sameElevation(l.elevation, level.elevation)) ?? level : undefined;
  const extent = buildingExtent(loaded ? [loaded] : levels, meshes);
  return extent ? { min: { ...extent.min }, max: { ...extent.max } } : null;
}

/** Put `box` on the view, or (`null`) take it off; the storey cut stays. One undo step. */
export function setSectionBox(viewId: string, box: SectionBox | null): void {
  const view = viewOf(viewId);
  if (!view) return;
  const { box: _old, ...rest } = view.cutaway ?? {};
  const cutaway: AxonometricCutaway = box ? { ...rest, box } : rest;
  updateProjectView(viewId, { cutaway: cutaway.storey || cutaway.box ? cutaway : undefined });
}

/** Move one side of the box to `metres`. Refused (`false`, nothing changed) when it is not a number or would leave the box with no volume. One undo step. */
export function setBoxEdge(viewId: string, end: BoxEnd, axis: BoxAxis, metres: number): boolean {
  const box = viewOf(viewId)?.cutaway?.box;
  if (!box || !Number.isFinite(metres)) return false;
  const next: SectionBox = { min: { ...box.min }, max: { ...box.max } };
  next[end][axis] = metres;
  if (!(next.min[axis] < next.max[axis])) return false;
  setSectionBox(viewId, next);
  return true;
}
