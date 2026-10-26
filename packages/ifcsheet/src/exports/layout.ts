/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */


/** Pure layout: ids, paper, frames, sheet templates, numbering, default views, section proposals and the drawing set. Add new exports of this area here, not in `../index.ts`. */

// Pure layout
export { freshProjectId } from '../ids.js';
export { CUSTOM_MM, ELONGATED_MM, ELONGATED_PAPERS, ISO_PAPERS, PAPER_MM, isCustom, isElongated, paperFromLabel, paperLabel, paperMm, readPaper } from '../paper.js';
export { DEFAULT_FRAME, FRAME_MARGIN_MM, MARGIN_MM, TITLE_BLOCK_MM, drawingAreaIn, frameOf, frameProblem, frameRect, readFrame, titleBlockRect, type FrameProblem, type Rect } from '../sheet-frame.js';
export { BUILT_IN_TEMPLATES, FILING_MARGIN_MM, allTemplates, findTemplate, readSeriesTemplates, readTemplate, templateFields, templateFromSheet } from '../sheet-templates.js';
export {
  DEFAULT_SCHEME, NUMBER_GROUPS, SCHEME_PRESETS, SEQUENTIAL_SCHEME, formatNumber, nextNumber, numberAt, numberGroupOf, numberSheets, planRenumber,
  readNumberingScheme, registerNumberIn, registerSlot, renumbered, typedBeforeSchemes, type OverrideMode, type RenumberRow,
} from '../numbering.js';
export { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION, declaredVersion } from '../project-version.js';
export { SHEET_SCALES, fitViewportBox, mmPerMetre, paperOf } from '../viewport-fit.js';
export { paperSigns, placer } from '../sheet-graphic.js';
export {
  DEFAULT_PLAN_CUT_HEIGHT_M, ELEVATION_DIRECTIONS, LEVEL_MATCH_TOLERANCE_M, NEXT_FLOOR_CLEARANCE_M, defaultPlanCutHeight, defaultViews, elevationName, levelFloorY, levelsFromStoreys, planDepthBelowCut, planViewFor,
  resolvePlanLevel, sameElevation, syncDefaultViews, uniqueViewName, type StoreyInput,
} from '../view-defaults.js';
export { DEPTH_MARGIN_M, ELEVATION_CLEARANCE_M, elevationDepth, elevationPlaneOffset, proposalDepth, type Extent3 } from '../set-defaults.js';
export { CUT_OVERHANG_M, SAME_CUT_M, SMALLEST_ROOM_M2, proposeSections, type Footprint, type ProposalInput, type RoomFootprint, type SectionProposal } from '../section-proposals.js';
export { customPlaneCenter, sectionPlaneThrough, type WorldPoint } from '../section-plane.js';
export {
  PER_SHEET, SET_PAPER, SET_PAPERS, SET_SCALES, TARGET_SCALE, buildDrawingSet, choosePaper, detailedScaleThatFits, drawingArea, fitsScale, fittingScale,
  groundPlan, groupOfView, groupsThatDoNotFit, isSetSheet, overrun, placeViewports, scaleOn, sheetGroup, sheetScaleReason, sheetSeries, viewCentre, viewExtent,
  withViewHung, type Arrangement, type ModelExtent, type Reason, type SetGroup, type SetInput, type SheetLayout,
} from '../drawing-set.js';
export { resolveStoreyOriginMeters, storeyFloorY, type Point3 } from '../storey-origin.js';
export { boundsFromIndex, createEntityBoundsLookup, getEntityBounds, indexMeshesByEntity, isValidCoord, unionEntityBounds, type BoundingBox3D, type Point3D } from '../entity-bounds.js';
export { FRAMING_RULE, boxGap, farElementLabel, frameElements, frameEntities, type FarElement, type FramedElement, type Framing, type FramingOptions } from '../framing.js';
