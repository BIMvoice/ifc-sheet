/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A saved project's drawing set (#479): the readers of its views, sheets, drafts and styles, which the app's file reader and the
 * engine's both use, and what draws its drafts and placed schedules on a sheet, which the app's sheet and the engine's PDF both use.
 * Add new exports of this area here, not in `../index.ts`.
 */

// Reading the set from a project file
export { DISCIPLINE_IDS, fail, isDisciplineId, isNumber, isObject, isString, listAt, readLevel, readSheet, readView, type Json } from '../set-read.js';
export { readGraphics, readPhaseSource } from '../view-graphics-read.js';
export { readViewTemplate, readViewTemplates } from '../view-templates-read.js';
export { readDimStyles, readGraphicStandard, readLayerGroups, readStandards, readTextStyles } from '../standards-read.js';
export { readDraft, readDraftLayer, readShape } from '../draft-read.js';
export { holdsSet, projectSetOf, readProjectSet, type ProjectSet, type ProjectSetFacts } from '../project-set.js';
export { PHASES, type PhaseMapping, type PhaseSource } from '../view-graphics-types.js';
// The drafted shapes and how one looks
export {
  TEXT_FRAMES, asTextFrame, isGeometry,
  type AnnotationShape, type AxisEnds, type AxisShape, type DraftEntity, type DraftLayer, type DraftParamValue, type DraftShape, type EntityShape, type LevelRef, type Pt,
  type SnapHit, type SnapMode, type SymbolInstanceShape, type TextFrame,
} from '../draft-types.js';
export {
  DEFAULT_TEXT_STYLE, DIM_OVERRIDES, TEXT_OVERRIDES, dashOf, dimStyleOf, formatDimension, layerLocked, layerPen, layerShows, lookOf, naturalDecimals, overrideKey,
  readableDeg, resolveDim, resolveText, textStyleOf, unitFactor, type LayerGroup, type LayerVisibilityScope, type LineType, type StyleBook,
} from '../draft-look.js';
export { arrowMark, formatLength, linearLayout, unitVector, type ArrowMark, type DimensionLayout, type LayoutOptions } from '../dimension-layout.js';
export { DEFAULT_VIEW_SCALE, annotationAtFactor, annotationFactor, viewportPaperUnit } from '../viewport-annotation.js';
// A schedule on paper, and where it sits on a sheet
export type { ScheduleCell, ScheduleLayout, SchedulePrim } from '../schedule-prim.js';
export {
  PAD, PEN, ROW, TEXT, layoutPagedTable, pageTitle, textWidth, wrapNote,
  type PagedOptions, type TableBlock, type TableItem,
} from '../paged-table.js';
export { layoutListSchedule, type ListSheetLabels } from '../list-schedule-layout.js';
export { layoutOnSheet, layoutTableOnSheet, registerHolders, scheduleBox, scheduleHomeBox, sheetDrawingArea } from '../schedule-place.js';
