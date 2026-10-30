/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A drafted text's frame and leader on the paper (#479), as the app's sheet draws them (`Label` and the text case of
 * `AnnotationGraphics.tsx`): the frame is laid out in the text's own frame by `textBlock` (the one layout the app's drawing, picking and
 * bounds use), turned with the text and drawn in the text's colour at the app's width of `max(0.06 of the height, 0.5)` paper mm;
 * the leader is the line from the frame's edge to the tip with an arrow at the tip, in the layer's colour. The frame is measured with
 * the width table (`text-width.ts`); the app measures with the browser's font, so the two differ by the font's own advances only.
 */

import type { Point2D } from '@ifc-lite/drawing-2d';
import type { AnnotationShape, Pt } from './draft-types.js';
import { K, type MarkContext } from './sheet-marks.js';
import { readableAngle, tickStrokes, type Frame } from './sheet-stroke.js';
import { textBlock, type FrameShape } from './text-block.js';
import { textLeaderOf } from './text-leader.js';
import type { TextFace } from './text-advance.js';

/** Segments of a quarter of a rounded corner. */
const CORNER_STEPS = 6;
/** Segments of an ellipse: a multiple of four, so the four quadrant points are vertices. */
const ELLIPSE_STEPS = 48;

/** The outline of a frame shape, in the text's own frame (x along the text, y down the page), as a closed run of points. */
export function frameOutline(shape: FrameShape): Pt[] {
  if (shape.kind === 'ellipse') {
    const ring = Array.from({ length: ELLIPSE_STEPS }, (_, i) => {
      const t = (2 * Math.PI * i) / ELLIPSE_STEPS;
      return { x: shape.cx + shape.rx * Math.cos(t), y: shape.cy + shape.ry * Math.sin(t) };
    });
    return [...ring, ring[0]];
  }
  const { x, y, w, h, radius: r } = shape;
  if (r <= 0) return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y }];
  // Quarter arcs round each corner, starting from the top left and going clockwise (y down).
  const corners: [number, number, number][] = [[x + r, y + r, Math.PI], [x + w - r, y + r, -Math.PI / 2], [x + w - r, y + h - r, 0], [x + r, y + h - r, Math.PI / 2]];
  const out = corners.flatMap(([cx, cy, from]) => Array.from({ length: CORNER_STEPS + 1 }, (_, i) => {
    const t = from + ((Math.PI / 2) * i) / CORNER_STEPS;
    return { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) };
  }));
  return [...out, out[0]];
}

/**
 * The frame and leader of `shape` (a text already scaled to the viewport, `sized`), drawn into `c.out`. `deg` is the text's angle on the
 * paper (`readableAngle`), `face` its text style, `colour` the colour of the text.
 */
export function drawTextFrame(shape: Extract<AnnotationShape, { type: 'text' }>, c: MarkContext, face: TextFace, textColour: string): void {
  const size = Math.max(shape.height * c.mmPerMetre, 1);
  const origin = c.at(shape.p);
  const block = textBlock(shape.text, size, shape.frame, face);
  if (block.frame) {
    const r = (readableAngle(shape.rotation, c.frame) * Math.PI) / 180;
    const [cos, sin] = [Math.cos(r), Math.sin(r)];
    const onPaper = (p: Pt): Point2D => ({ x: origin.x + p.x * cos - p.y * sin, y: origin.y + p.x * sin + p.y * cos });
    c.out.strokes.push({ colour: textColour, width: Math.max(size * 0.06, 0.5), runs: c.clip(frameOutline(block.frame).map(onPaper)) });
  }
  const line = textLeaderOf(shape, upOf(c.frame));
  if (!line) return;
  const [from, tip] = [c.at(line.from), c.at(line.tip)];
  c.out.strokes.push({ colour: c.colour, width: K, runs: c.clip([from, tip]) });
  c.out.strokes.push(...tickStrokes('arrow', [{ p: tip, dir: { x: tip.x - from.x, y: tip.y - from.y } }], Math.max(c.look.dim.arrowSize * 1.2, 4 * K), c.colour, K));
}

/** Which way is up on the screen in drawing y for a view with these signs: -ky (+1 for sections and elevations, -1 for plans). */
export const upOf = (frame: Frame): 1 | -1 => (frame.ky === 1 ? -1 : 1);
