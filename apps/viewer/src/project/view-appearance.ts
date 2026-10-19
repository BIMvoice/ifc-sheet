/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a view shows of its generated drawing. An elevation shows what is
 * visible from outside, in solid lines, with the building's outline heavier:
 * nothing hidden unless the view asks for it (`showHidden`); so does an
 * axonometric (a 3D view), which is also seen from outside. Plans and sections
 * keep the hidden lines they always had. Pure; the view's host applies it to
 * every drawing it generates, so tabs, sheets and exports all see the same.
 */

import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { cropDrawing } from './drawing-crop';
import { outlineLines } from './elevation-outline';
import { drawingWithGround } from './ground';
import type { ProjectView } from './types';

/** Whether a view draws the lines the hidden-line pass found occluded (dashed). */
export function viewShowsHidden(view: Pick<ProjectView, 'kind' | 'showHidden'>): boolean {
  return view.showHidden ?? (view.kind !== 'elevation' && view.kind !== '3d');
}

const occluded = (l: Drawing2D['lines'][number]) => l.visibility === 'hidden' || l.category === 'hidden';

type Shown = Pick<ProjectView, 'kind' | 'showHidden' | 'detail'>;

function withoutOverlays(source: Drawing2D, view: Shown): Drawing2D {
  const drawing = view.kind === 'elevation' || view.kind === 'section' ? drawingWithGround(source, view.kind) : source;
  if (view.kind !== 'elevation') return viewShowsHidden(view) ? drawing : { ...drawing, lines: drawing.lines.filter((l) => !occluded(l)) };
  const kept = viewShowsHidden(view) ? drawing.lines : drawing.lines.filter((l) => !occluded(l));
  const outline = outlineLines({ ...drawing, lines: kept });
  return { ...drawing, lines: kept.map((l) => (outline.has(l) ? { ...l, category: 'silhouette' as const } : l)) };
}

/** The drawing as `view` shows it: hidden lines and outline as above, and a detail cropped to its area. The generated drawing is not changed. */
export function drawingAsViewShows(drawing: Drawing2D, view: Shown): Drawing2D {
  const shown = withoutOverlays(drawing, view);
  return view.detail ? cropDrawing(shown, { min: view.detail.min, max: view.detail.max }) : shown;
}
