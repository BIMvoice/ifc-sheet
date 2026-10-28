/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Annotation size on a sheet: the engine's rule (`packages/ifcsheet/src/viewport-annotation.ts`), which the PDF of
 * `ifcsheet build` prints with too (#479), given the app's symbol library to say which symbols are drawn in paper millimetres.
 */

import { annotationAtFactor as sizedAtFactor, annotationFactor, findSymbol } from '@bimvoice/ifcsheet';
import { isGeometry, type AnnotationShape, type DraftEntity } from '@/drafting/types';

export { DEFAULT_VIEW_SCALE, annotationFactor, viewportPaperUnit } from '@bimvoice/ifcsheet';

/** `shape` with its paper-size-bound dimensions multiplied by `factor`; geometry is untouched. */
export function annotationAtFactor(shape: AnnotationShape, factor: number): AnnotationShape {
  return sizedAtFactor(shape, factor, (id) => findSymbol(id)?.unit === 'paper');
}

/**
 * `drafts` with the annotation of `viewId` re-expressed for a view drawn at
 * `to` instead of `from`: the stored metres change so the paper size does not.
 * Changing a view's scale must not make its text grow (#488).
 */
export function draftsAtViewScale(drafts: readonly DraftEntity[], viewId: string, from: number | undefined, to: number | undefined): DraftEntity[] {
  if (to === undefined || !(to > 0)) return drafts as DraftEntity[];
  const factor = annotationFactor(to, from);
  if (factor === 1 || !drafts.some((d) => d.viewId === viewId)) return drafts as DraftEntity[];
  return drafts.map((d) => (d.viewId !== viewId || isGeometry(d.shape) ? d : { ...d, shape: annotationAtFactor(d.shape, factor) }));
}
