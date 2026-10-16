/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The rooms of a plan: each space of the geometry the drawings are made from,
 * cut at the plan's height, with the GlobalId of its space. TAGALL labels them
 * and the check reports the ones without a label, so both read them here, from
 * `currentDrawingRuntime()` (the federated geometry, with the workspace
 * placement) and not from the viewer store's legacy single-model result.
 */

import type { GeometryResult } from '@ifc-lite/geometry';
import { renderIdGlobalId } from '@/project/element-guid';
import type { ProjectLevel, ProjectView } from '@/project/types';
import { resolvePlanLevel } from '@/project/view-defaults';
import { roomFootprints, type RoomOfPlan } from './footprint';

export function roomsOfPlan(view: ProjectView, levels: readonly ProjectLevel[], geometry: Pick<GeometryResult, 'meshes'> | null | undefined): RoomOfPlan[] {
  if (view.kind !== 'plan') return [];
  const level = resolvePlanLevel(view, levels) ?? view.level;
  return roomFootprints(geometry?.meshes ?? [], level.elevation + view.cutHeight, level.elevation).flatMap((r) => {
    const guid = renderIdGlobalId(r.renderId);
    return guid ? [{ ...r, guid }] : [];
  });
}
