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
import { interiorCropRect } from './interior-crop';
import { outlineLines } from './elevation-outline';
import { drawingWithGround } from './ground';
import type { InteriorElevation, ProjectView } from './types';

/** Whether a view draws the lines the hidden-line pass found occluded (dashed). */
export function viewShowsHidden(view: Pick<ProjectView, 'kind' | 'showHidden'>): boolean {
  return view.showHidden ?? (view.kind !== 'elevation' && view.kind !== '3d');
}

const occluded = (l: Drawing2D['lines'][number]) => l.visibility === 'hidden' || l.category === 'hidden';

type Shown = Pick<ProjectView, 'kind' | 'showHidden' | 'detail'> & {
  interior?: InteriorElevation;
  /**
   * What a discipline plan leaves out (`viewOmits`). The sheet and the tab draw the drawing without those elements, so the
   * drawing is framed on what is left: its bounds are the extent of the lines and cut faces that stay, not the model's.
   */
  omits?: (entityId: number, ifcType: string | undefined) => boolean;
};

/** The extent of the lines and cut faces of `drawing` that `omits` keeps; null when none is left. */
function boundsKept(drawing: Drawing2D, omits: NonNullable<Shown['omits']>): Drawing2D['bounds'] | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const take = (x: number, y: number): void => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const l of drawing.lines) if (!omits(l.entityId, l.ifcType)) { take(l.line.start.x, l.line.start.y); take(l.line.end.x, l.line.end.y); }
  for (const p of drawing.cutPolygons) if (!omits(p.entityId, p.ifcType)) for (const q of p.polygon.outer) take(q.x, q.y);
  return minX <= maxX ? { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } } : null;
}

function withoutOverlays(source: Drawing2D, view: Shown): Drawing2D {
  // The ground line is a facade's: an interior elevation looks at a wall from inside the room.
  const drawing = (view.kind === 'elevation' && !view.interior) || view.kind === 'section' ? drawingWithGround(source, view.kind) : source;
  if (view.kind !== 'elevation') return viewShowsHidden(view) ? drawing : { ...drawing, lines: drawing.lines.filter((l) => !occluded(l)) };
  const kept = viewShowsHidden(view) ? drawing.lines : drawing.lines.filter((l) => !occluded(l));
  const outline = outlineLines({ ...drawing, lines: kept });
  return { ...drawing, lines: kept.map((l) => (outline.has(l) ? { ...l, category: 'silhouette' as const } : l)) };
}

/** The drawing as `view` shows it: hidden lines and outline as above, a detail cropped to its area and an interior elevation to its wall and the side walls cut at its ends. The generated drawing is not changed. */
export function drawingAsViewShows(drawing: Drawing2D, view: Shown): Drawing2D {
  const visible = withoutOverlays(drawing, view);
  const shown = view.omits ? { ...visible, bounds: boundsKept(visible, view.omits) ?? visible.bounds } : visible;
  if (view.interior) return cropDrawing(shown, interiorCropRect(drawing, view.interior));
  return view.detail ? cropDrawing(shown, { min: view.detail.min, max: view.detail.max }) : shown;
}
