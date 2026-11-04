/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A label stays attached to its element: it keeps the element's outline
 * (`params.labelRef`) and, by the label type's leader option, carries a
 * leader to that outline or not. Placing a label and dragging one by hand
 * both end here, so the rule is the same. The text is measured by the caller
 * (`widthOf`, the app's font measurer; the table without one).
 */

import type { AnnotationShape, Pt } from '../draft-types.js';
import type { TextFace } from '../text-advance.js';
import { textBoxOf } from '../text-leader.js';
import type { Rect } from './label-geometry.js';
import { DEFAULT_LEADER, DISPLACED_MM, leaderTip, type LeaderMode } from './label-leader.js';

export type TextShape = Extract<AnnotationShape, { type: 'text' }>;
export type WidthOf = (line: string, face?: TextFace) => number;

/** The box a text and its frame fill, drawing coordinates; `up` is the drawing's screen-up sign. */
export function textRectOf(shape: TextShape, up: 1 | -1, widthOf?: WidthOf): Rect {
  const pts = textBoxOf(shape.p, shape.text, shape.height, shape.rotation, shape.frame, up, widthOf);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** `shape` with the leader the mode gives it to the element outline `ring`; `paperUnit` is drawing units per paper millimetre. */
export function withLeaderOf(shape: TextShape, ring: readonly Pt[] | null, mode: LeaderMode | undefined, paperUnit: number, up: 1 | -1, widthOf?: WidthOf): TextShape {
  const { leader: _old, ...rest } = shape;
  const tip = ring ? leaderTip(mode ?? DEFAULT_LEADER, textRectOf(shape, up, widthOf), ring, DISPLACED_MM * paperUnit) : undefined;
  return tip ? { ...rest, leader: tip } : rest;
}
