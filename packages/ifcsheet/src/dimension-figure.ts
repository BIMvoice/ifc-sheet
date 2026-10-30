/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A dimension's layout with the leader of a figure moved off its line (#479): the app's drafting and sheet and the engine's PDF all lay
 * a dimension out here. A figure moved above, below or past the end of its string (`textAt`) carries a short leader from the middle of
 * the dimension line to the figure's near edge; nothing for a figure left on its line. The leader is among the layout's lines.
 *
 * It depends on which way the view's screen runs (`frame`: `up` +1 for sections and elevations, -1 for plans; `right` -1 for a side
 * view), because the figure reads on the upper side of its line on the screen. The caller says which view it is.
 */

import { angularLayout, linearLayout, radialLayout, type DimensionLayout, type LayoutOptions } from './dimension-layout.js';
import type { AnnotationShape, Pt } from './draft-types.js';
import { figureUp, leaderOf } from './figure-layout.js';
import { textBlock } from './text-block.js';
import { tableWidthEm, type TextFace } from './text-advance.js';

/** The way a view's screen runs: what `annotationFrameOf` (app) and the paper's signs (engine, `up` = -ky, `right` = kx) say of it. */
export interface ScreenFrame {
  up: 1 | -1;
  right: 1 | -1;
}

const half = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** The leader of a figure moved off its dimension line, in the layout's units: from the middle of the line to the figure's near edge. */
function figureLeader(layout: DimensionLayout, textAt: Pt, height: number, frame: ScreenFrame, widthOf: (line: string, face?: TextFace) => number): { a: Pt; b: Pt }[] {
  const line = layout.lines[2];
  const along = { x: Math.cos(layout.textAngle), y: Math.sin(layout.textAngle) };
  const l = leaderOf(half(line.a, line.b), textAt, height, figureUp(along, frame.up, frame.right), along, textBlock(layout.label, height, undefined, undefined, widthOf).outer.x1);
  return l ? [l] : [];
}

/** The layout of a linear, radial or angular dimension; a linear one's moved figure (`textAt`) is placed with its leader. `widthOf` measures the figure (default: the table). */
export function dimensionLayout(
  shape: Extract<AnnotationShape, { type: 'dimension' | 'radial' | 'angular' }>, o: LayoutOptions, frame: ScreenFrame, widthOf: (line: string, face?: TextFace) => number = tableWidthEm,
): DimensionLayout {
  if (shape.type === 'dimension') {
    const layout = linearLayout(shape.a, shape.b, shape.at, shape.variant, shape.text, o);
    return shape.textAt ? { ...layout, lines: [...layout.lines, ...figureLeader(layout, shape.textAt, shape.height, frame, widthOf)], textAt: shape.textAt } : layout;
  }
  if (shape.type === 'radial') return radialLayout(shape.c, shape.r, shape.at, shape.diameter, o);
  return angularLayout(shape.c, shape.a, shape.b, shape.at, o);
}
