/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the plan in front draws over its cut that a ceiling tag keeps clear of (#271): the door leaves and swings,
 * window frames, roof lines and grid, in the boxes the cross-reference marks use (`overlayObstacleBoxes`). The
 * drafting view installs it for the command (`setPlanObstaclesProvider`); the command adds the drafts itself.
 * It reaches `plan-overlays`, so the drafting session must not import it.
 */

import type { MeshData } from '@ifc-lite/geometry';
import { overlayObstacleBoxes, type Box } from '@/drafting/cross-ref-marks';
import { planOverlays } from '@/project/plan-overlays';
import type { ProjectLevel, ProjectView } from '@/project/types';
import { hiddenClasses } from '@/project/view-graphics';
import { liveGraphics } from '@/project/view-graphics-live';
import { viewPlaneConfig } from '@/project/view-plane-config';

export function planSymbolObstacles(view: ProjectView, levels: readonly ProjectLevel[], meshes: readonly MeshData[], flips: Record<string, number> | undefined): Box[] {
  const plane = viewPlaneConfig(view, levels, null);
  return plane ? overlayObstacleBoxes(planOverlays(view, plane, meshes, flips, hiddenClasses(liveGraphics(view)))) : [];
}
