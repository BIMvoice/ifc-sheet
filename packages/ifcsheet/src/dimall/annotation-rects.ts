/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The boxes the annotations on a view fill, measured from the engine's text widths (#707): what the app's `rectsOf` reads off the browser's
 * font, for a run with no browser. A label placed after another keeps clear of these. Texts (with their leader), leader notes, level marks and
 * the lines and figure of a dimension are covered, the annotations "Annotate the set" draws; hatches and shapes it never draws are left out.
 */

import type { DraftEntity, Pt } from '../draft-types.js';
import { dimensionLayout } from '../dimension-figure.js';
import { textBoxOf, textLeaderOf, type Rect } from '../text-leader.js';
import type { DimAllMeasure, RectsOf } from './measure.js';

const boundsOf = (pts: readonly Pt[]): Rect => ({
  x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)),
});

/** The box of one annotation, or none for a shape this does not measure. */
function rectOf(shape: DraftEntity['shape'], m: DimAllMeasure): Rect | null {
  const { up, right } = m.frame;
  switch (shape.type) {
    case 'text': {
      const leader = textLeaderOf(shape, up, m.widthOf);
      return boundsOf([...textBoxOf(shape.p, shape.text, shape.height, shape.rotation, shape.frame, up, m.widthOf), ...(leader ? [leader.from, leader.tip] : [])]);
    }
    case 'leader': {
      const end = shape.pts[shape.pts.length - 1];
      if (!end) return null;
      const width = m.widthOf(shape.text) * shape.height;
      const anchor = right > 0 ? end : { x: end.x - width, y: end.y };
      return boundsOf([...shape.pts, ...textBoxOf(anchor, shape.text, shape.height, 0, undefined, up, m.widthOf)]);
    }
    case 'level': {
      const h = shape.height * up;
      return boundsOf([shape.p, { x: shape.p.x - shape.height, y: shape.p.y + h }, { x: shape.p.x + shape.height, y: shape.p.y + h }, { x: shape.p.x + shape.height * 5, y: shape.p.y }]);
    }
    case 'dimension': case 'radial': case 'angular': {
      const layout = dimensionLayout(shape, {}, m.frame, m.widthOf);
      return boundsOf([...layout.lines.flatMap((l) => [l.a, l.b]), ...textBoxOf(layout.textAt, layout.label, shape.height, layout.textAngle, undefined, up, m.widthOf)]);
    }
    default:
      return null;
  }
}

/** `RectsOf` measured with `m`: the box of each annotation among the drafts. */
export function annotationRects(m: DimAllMeasure): RectsOf {
  return (drafts) => drafts.flatMap((d) => rectOf(d.shape, m) ?? []);
}
