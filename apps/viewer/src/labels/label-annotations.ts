/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The boxes the annotations on a view fill, for a label to keep clear of. */

import { dimensionLayout, entityBounds, entitySkeleton } from '@/drafting/annotation';
import { textBlock } from '@/drafting/text-block';
import { shapeBounds } from '@/drafting/curves';
import { isGeometry, type AnnotationShape, type DraftEntity } from '@/drafting/types';
import type { Rect } from './label-geometry';

/** The box a dimension's figure fills: its text, a text height each side of where the figure is, turned with the line. */
function figureRect(shape: Extract<AnnotationShape, { type: 'dimension' }>): Rect {
  const layout = dimensionLayout(shape);
  const w = textBlock(layout.label, shape.height).outer.x1 + 0.2 * shape.height, h = 2 * shape.height;
  const cos = Math.abs(Math.cos(layout.textAngle)), sin = Math.abs(Math.sin(layout.textAngle));
  const hx = (w * cos + h * sin) / 2, hy = (w * sin + h * cos) / 2;
  return { x0: layout.textAt.x - hx, y0: layout.textAt.y - hy, x1: layout.textAt.x + hx, y1: layout.textAt.y + hy };
}

/** Annotations only, hatches apart (they fill areas, not mark places): the lines of the drawing itself are the elements' outlines, which labels are checked against separately. */
export function rectsOf(drafts: readonly DraftEntity[]): Rect[] {
  return drafts.filter((d) => !isGeometry(d.shape) && d.shape.type !== 'hatch').flatMap((d): Rect[] => {
    // A dimension is its lines and its figure, not the box round them: the ground between its extension lines is free.
    const parts = d.shape.type === 'dimension' ? entitySkeleton(d.shape).map(shapeBounds) : [entityBounds(d.shape)];
    return [...parts.map((b) => ({ x0: b.min.x, y0: b.min.y, x1: b.max.x, y1: b.max.y })), ...(d.shape.type === 'dimension' ? [figureRect(d.shape)] : [])];
  });
}
