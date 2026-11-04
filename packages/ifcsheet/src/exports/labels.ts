/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** The geometry and templates under tag and label placement (#707): rectangles and rings, the rectangle index, the layout of labels, the tag text template and the elements of a view. Add new exports of this area here, not in `../index.ts`. */

export {
  growRect, nearestOnRing, pointInRing, rectAround, rectHitsRing, rectInsideRing, rectRingGap, rectsOverlap, ringBounds, unionRect,
} from '../labels/label-geometry.js';
export { RectIndex } from '../labels/rect-index.js';
export { LABEL_CLEAR_MM, LABEL_GAP_MM, layoutLabels, type LayoutElement } from '../labels/label-layout.js';
export {
  ATTRIBUTE_FIELDS, fieldPath, parseFieldRef, parseTemplate, templateFields as labelTemplateFields,
  type AttributeField, type FieldRef, type ParsedTemplate, type TemplateField,
} from '../labels/label-template.js';
export { formatValue, parseFormatSpec } from '../labels/label-format.js';
export { viewElements, type ViewElement } from '../labels/view-elements.js';
