/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * How a view is cut: the settings the app's drawing hook (`useDrawingGeneration`) and the engine's sheets
 * (`view-drawings.ts`) both hand the generator, for a plan, an elevation and a section alike (#627). The app once cut
 * every view classified and with the Rust outline while the engine did so for plans only, so the projection lines of an
 * elevation or a section differed on non-box geometry.
 */

import type { Drawing2D } from '@ifc-lite/drawing-2d';
import type { PlanProjectView, ProjectView } from './document.js';

/** What the generator is asked to produce for a view whose projection is `projectionOn`. */
export interface ViewCutOptions {
  /** Classify occlusion always (#6615): whether the hidden edges are drawn is `viewShowsHidden`, not this. */
  includeHiddenLines: boolean;
  includeProjection: boolean;
  includeEdges: boolean;
  mergeLines: boolean;
  /** Project non-extruded geometry through the Rust `meshOutline2d` outline, where the wasm build has it. */
  outline: boolean;
}

export function viewCutOptions(projectionOn: boolean, outlineAvailable: boolean): ViewCutOptions {
  return { includeHiddenLines: projectionOn, includeProjection: projectionOn, includeEdges: projectionOn, mergeLines: true, outline: projectionOn && outlineAvailable };
}

/** Whether a view draws the lines the hidden-line pass found occluded (dashed). A plan (floor, ceiling, site, detail of a plan) does; a section, an elevation, an interior elevation and an axonometric do not unless the view sets `showHidden` (#557). */
export function viewShowsHidden(view: Pick<ProjectView, 'kind' | 'showHidden'>): boolean {
  return view.showHidden ?? view.kind === 'plan';
}

/**
 * Whether a plan draws, dashed, what lies below its level's floor (`showLowerFloor`): the floor
 * below seen through the slab. Absent: it does, as plans always have.
 */
export function viewShowsLowerFloor(view: Pick<PlanProjectView, 'showLowerFloor'>): boolean {
  return view.showLowerFloor !== false;
}

/**
 * A line lying on the floor plane is not below it; this absorbs the plane's arithmetic, which a
 * percentage round trip can leave a few ulps off (#628).
 */
const LOWER_FLOOR_EPSILON_M = 1e-6;

/**
 * `drawing` without the dashed lines below the plan's floor: its hidden lines deeper than its
 * `cutHeight` (the floor sits that far under the cut), which are the floor below seen through the
 * slab. The overhead band (depth 0), this floor's hidden lines and what shows through an opening
 * (visible) stay. Returns `drawing` itself when the view keeps the floor below.
 */
export function drawingWithoutLowerFloor(drawing: Drawing2D, view: Pick<PlanProjectView, 'cutHeight' | 'showLowerFloor'>): Drawing2D {
  if (viewShowsLowerFloor(view)) return drawing;
  const floor = view.cutHeight + LOWER_FLOOR_EPSILON_M;
  const dashed = (l: Drawing2D['lines'][number]): boolean => l.visibility === 'hidden' || l.category === 'hidden';
  const lines = drawing.lines.filter((l) => !(dashed(l) && Math.min(l.depth, l.depthEnd ?? l.depth) > floor));
  return lines.length === drawing.lines.length ? drawing : { ...drawing, lines };
}
