/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * How far a view looks past its cut: the one rule the app's drawing hook
 * (`useDrawingGeneration`) and the engine's sheets (`view-drawings.ts`) both
 * take their projection bands from (#615). The app once drew a plan the
 * engine left blank because each kept its own copy of it.
 */

import type { ProjectView } from './document.js';
import { planDepthBelowCut } from './view-defaults.js';

/** How deep the projection reaches on each side of the cut, metres: `below` toward the floor, `above` toward the ceiling. */
export interface ProjectionBands {
  below: number;
  above: number;
}

/** What a view says about projection: whether it shows, and how deep (`null`: the automatic bands). */
export interface ViewProjection {
  showConstructionProjection: boolean;
  constructionProjectionDepth: number | null;
}

/**
 * Projection follows the view's depth: a plan with no depth of its own sees
 * down to its level's floor (as deep as its cut is high), a section /
 * elevation (and a reflected ceiling plan, which sees all that is above its
 * cut) with no depth projects with the automatic bands, and an
 * explicit depth always projects exactly that far (0: the cut only).
 */
export function viewProjection(view: Pick<ProjectView, 'kind' | 'viewDepth'> & { cutHeight?: number; reflected?: boolean }): ViewProjection {
  const depth = typeof view.viewDepth === 'number' && view.viewDepth >= 0 ? view.viewDepth : null;
  if (depth !== null) return { showConstructionProjection: depth > 0, constructionProjectionDepth: depth };
  if (view.kind === 'plan' && !view.reflected) return { showConstructionProjection: (view.cutHeight ?? 0) > 0, constructionProjectionDepth: view.cutHeight ?? 0 };
  return { showConstructionProjection: true, constructionProjectionDepth: null };
}

export interface BoundedBandsInput {
  /** The view's bounded depth (`ViewProjection.constructionProjectionDepth`), metres. */
  depth: number;
  /** The cut's position along its axis, and the model's top along it, in the same frame. */
  position: number;
  axisMax: number;
  /** The cut looks down (a plan: axis `down`). */
  down: boolean;
  /** A plain plan: looking down, not flipped, not reflected and not on a custom plane, the one cut that may sit above the model. */
  plainPlan: boolean;
}

/**
 * The bands of a view with a bounded depth, from `base`, the bands the cut has
 * before its own depth is read (the whole model's extent on both sides, or the
 * storey's when the app scopes a plan to its floor). The floor side is the
 * depth itself, taken from the model top when a plain plan's cut is above the
 * model (#226); the ceiling side is dropped for a depth of 0 and for a cut
 * that is not a plan, and otherwise keeps `base`, so a plan sees what is
 * overhead (a roof, a bridge deck) as far as `base` allows.
 */
export function boundedProjectionBands(base: ProjectionBands, input: BoundedBandsInput): ProjectionBands {
  const below = input.plainPlan ? planDepthBelowCut(input.depth, input.position, input.axisMax) : input.depth;
  return { below, above: input.depth === 0 || !input.down ? 0 : base.above };
}
