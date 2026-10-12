/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Annotation size on a sheet. Text, dimension, level, leader and axis sizes
 * are stored in model metres at the scale of the view they were drawn on
 * (0.25 m is 2.5 mm at 1:100). A viewport may show the view at another scale;
 * the paper size an annotation was drawn for must not change with it, so its
 * sizes are multiplied by viewport scale / view scale, and the style values in
 * paper millimetres (extension gaps, arrows) are converted with the viewport's
 * scale, not the view's.
 */

import type { AnnotationShape } from '@/drafting/types';

/** The view scale a viewport shows it at, when the view carries none. */
export const DEFAULT_VIEW_SCALE = 100;

/** Factor on stored annotation sizes so they print at the size they were drawn for. */
export function annotationFactor(viewportScale: number, viewScale: number | undefined): number {
  return viewportScale / (viewScale && viewScale > 0 ? viewScale : DEFAULT_VIEW_SCALE);
}

/** Model metres per paper millimetre in a viewport at `viewportScale`. */
export const viewportPaperUnit = (viewportScale: number): number => viewportScale / 1000;

/** `shape` with its paper-size-bound dimensions multiplied by `factor`; geometry is untouched. */
export function annotationAtFactor(shape: AnnotationShape, factor: number): AnnotationShape {
  if (factor === 1 || shape.type === 'hatch') return shape;
  const sized = { ...shape, height: shape.height * factor };
  return sized.type === 'axis' ? { ...sized, size: sized.size * factor } : sized;
}
