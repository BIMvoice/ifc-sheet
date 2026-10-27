/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Annotation size on a sheet: the engine's rule (`packages/ifcsheet/src/viewport-annotation.ts`), which the PDF of
 * `ifcsheet build` prints with too (#479), given the app's symbol library to say which symbols are drawn in paper millimetres.
 */

import { annotationAtFactor as sizedAtFactor, findSymbol } from '@bimvoice/ifcsheet';
import type { AnnotationShape } from '@/drafting/types';

export { DEFAULT_VIEW_SCALE, annotationFactor, viewportPaperUnit } from '@bimvoice/ifcsheet';

/** `shape` with its paper-size-bound dimensions multiplied by `factor`; geometry is untouched. */
export function annotationAtFactor(shape: AnnotationShape, factor: number): AnnotationShape {
  return sizedAtFactor(shape, factor, (id) => findSymbol(id)?.unit === 'paper');
}
