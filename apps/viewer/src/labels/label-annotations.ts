/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The boxes the annotations on a view fill, for a label to keep clear of. */

import { entityBounds } from '@/drafting/annotation';
import { isGeometry, type DraftEntity } from '@/drafting/types';
import type { Rect } from './label-geometry';

/** Annotations only, hatches apart (they fill areas, not mark places): the lines of the drawing itself are the elements' outlines, which labels are checked against separately. */
export function rectsOf(drafts: readonly DraftEntity[]): Rect[] {
  return drafts.filter((d) => !isGeometry(d.shape) && d.shape.type !== 'hatch').map((d) => {
    const b = entityBounds(d.shape);
    return { x0: b.min.x, y0: b.min.y, x1: b.max.x, y1: b.max.y };
  });
}
