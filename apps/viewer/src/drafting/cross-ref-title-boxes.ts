/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where the cross-reference marks of a plan stand, one box per mark part (drawing metres), for the view's title to keep clear of
 * (`viewTitleLayout`, #557). Measured as the sheet prints them (annotation at the viewport's scale) and with the input's own screen up,
 * as `fitWithCrossReferences` does.
 */

import { annotationAtFactor, annotationFactor } from '@/project/viewport-annotation';
import { withAnnotationScreenUp } from './annotation';
import { draftsExtent } from './drafting-view';
import { withCrossReferences, type PlanCrossRefInput } from './cross-ref-plan';
import { isGeometry, type Pt } from './types';

export interface DrawingBox { min: Pt; max: Pt }

export function crossReferenceBoxes(input: PlanCrossRefInput): DrawingBox[] {
  const marks = withCrossReferences(input).filter((d) => !input.drafts.includes(d));
  if (marks.length === 0) return [];
  const factor = annotationFactor(input.viewportScale, input.view?.scale);
  return withAnnotationScreenUp(input.screenUp, () => marks
    .map((d) => draftsExtent([isGeometry(d.shape) || factor === 1 ? d : { ...d, shape: annotationAtFactor(d.shape, factor) }]))
    .filter((b): b is DrawingBox => b !== null));
}
