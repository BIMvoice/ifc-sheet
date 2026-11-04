/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * How a view is cut: the settings the app's drawing hook (`useDrawingGeneration`) and the engine's sheets
 * (`view-drawings.ts`) both hand the generator, for a plan, an elevation and a section alike (#627). The app once cut
 * every view classified and with the Rust outline while the engine did so for plans only, so the projection lines of an
 * elevation or a section differed on non-box geometry.
 */

import type { ProjectView } from './document.js';

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

/** Whether a view draws the lines the hidden-line pass found occluded (dashed). */
export function viewShowsHidden(view: Pick<ProjectView, 'kind' | 'showHidden'>): boolean {
  return view.showHidden ?? (view.kind !== 'elevation' && view.kind !== '3d');
}
