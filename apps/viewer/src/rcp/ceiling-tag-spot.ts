/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where a ceiling tag stands once the plan's own drawing is taken into account: the centroid of the soffit, or,
 * when a door leaf, a swing or a drafted line is there, the nearest place on the same ceiling that is clear (#271).
 * The things to keep clear of are the ones the cross-reference marks keep clear of (`overlayObstacleBoxes`,
 * `obstacleBoxes`), so a tag and a mark agree on what is in the way. Pure.
 */

import { textBox } from '@/drafting/annotation';
import { boxOf, overlaps, obstacleBoxes, overlayObstacleBoxes, type Box } from '@/drafting/cross-ref-marks';
import type { DraftEntity, Pt } from '@/drafting/types';
import { centredAnchor } from '@/labels/label-place';
import { planOverlays } from '@/project/plan-overlays';
import { viewPlaneConfig } from '@/project/view-plane-config';
import { hiddenClasses } from '@/project/view-graphics';
import type { ProjectLevel, ProjectView } from '@/project/types';
import type { MeshData } from '@ifc-lite/geometry';

/** Clear space kept round a tag, as a share of its text height. */
const MARGIN_SHARE = 0.3;
/** The step the search walks by, as a share of the text height. */
const STEP_SHARE = 0.5;

/**
 * What the plan in front draws where a tag could stand: its door and window symbols (leaf and swing), roof lines and
 * grid, and the texts and lines already drafted on it.
 */
export function tagObstacles(view: ProjectView, levels: readonly ProjectLevel[], meshes: readonly MeshData[], flips: Record<string, number> | undefined, drafts: readonly DraftEntity[]): Box[] {
  const plane = viewPlaneConfig(view, levels, null);
  const overlays = plane ? planOverlays(view, plane, meshes, flips, hiddenClasses(view.graphics)) : [];
  return [...overlayObstacleBoxes(overlays), ...obstacleBoxes(drafts)];
}

/**
 * The centre to put a tag reading `text` at (drawing metres): `at` when its box is clear of `obstacles`, otherwise
 * the nearest centre, on a half text height grid, whose whole box lies inside `extent` and is clear. When no place
 * on the ceiling is clear it stays at `at`: a tag over something beats no tag.
 */
export function clearTagSpot(at: Pt, extent: Box, text: string, height: number, up: 1 | -1, obstacles: readonly Box[]): Pt {
  const boxAt = (c: Pt): Box => boxOf(textBox(centredAnchor(c, text, height, undefined, up), text, height, 0));
  const margin = MARGIN_SHARE * height;
  const clear = (c: Pt): boolean => obstacles.every((o) => !overlaps(boxAt(c), o, margin));
  if (clear(at)) return at;
  const step = STEP_SHARE * height;
  const reach = Math.ceil(Math.max(extent.x1 - extent.x0, extent.y1 - extent.y0) / step);
  const inside = (c: Pt): boolean => { const b = boxAt(c); return b.x0 >= extent.x0 && b.x1 <= extent.x1 && b.y0 >= extent.y0 && b.y1 <= extent.y1; };
  const spots: { c: Pt; d: number }[] = [];
  for (let i = -reach; i <= reach; i++) {
    for (let j = -reach; j <= reach; j++) {
      const c = { x: at.x + i * step, y: at.y + j * step };
      if (inside(c)) spots.push({ c, d: Math.hypot(i, j) });
    }
  }
  return spots.sort((a, b) => a.d - b.d).find(({ c }) => clear(c))?.c ?? at;
}
