/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The cross-reference marks (#619): a section's "1 / A-301" under its letter and the elevation marks round the ground plan, made from the
 * project's views and sheets as they are now and placed clear of the plan. The app's sheet and `sheetGraphic` (PDF, DXF, `ifcsheet build`) both
 * place them here. Add new exports of this area here, not in `../index.ts`.
 */

export { drawingNumbers, referenceLabel, sheetHolding, viewReference, type ViewReference } from '../cross-ref/reference.js';
export { boxesOverlap, boxOfPoints, obstacleBoxes, type CrossRefBox } from '../cross-ref/boxes.js';
export { ELEVATION_TEXT_MM, elevationMarkDrafts, elevationMarkPlan, markedElevation, type ElevationMarkInput } from '../cross-ref/elevation-marks.js';
export { sectionReferenceDrafts, type SectionReferenceOptions } from '../cross-ref/section-marks.js';
export { crossReferenceMarks, viewsNamedOnPlan, type PlanCrossRefs } from '../cross-ref/plan.js';
export {
  CIRCLE_POLE, CIRCLE_R, DETAIL_LINK, DETAIL_PART, FLAG_PAD, FLAG_POINT, FLAG_POLE, SECTION_LINK, TRIANGLE_HALF_BASE, TRIANGLE_LEN,
  markHeadReach, placementOf, sectionLink, sectionNormal, symbolParts, withoutSectionLink, type SymbolPlacement,
} from '../cross-ref/section-geometry.js';
export { viewTitleLayout, type ViewTitleLayout } from '../view-title.js';
