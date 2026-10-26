/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */


/** Schedules and lists: readiness, the bill of quantities, list schedules, sub-reports and their checks, joinery, rooms and areas. Add new exports of this area here, not in `../index.ts`. */

// What the model lacks (the counting, `readModelFacts`, is in `/headless` and `/readiness-read`: it loads the parser)
export { READINESS_EN, describeReadiness, modelReadiness, type ModelFacts, type ReadinessFinding, type ReadinessKind } from '../readiness.js';
// The bill of quantities (antemasuratoare, #75). Reading it from models is `/project`: it loads the parser.
export {
  BOQ_QUANTITIES, BOQ_UNITS, BOQ_UNIT_TEXT, COUNT_QUANTITY, MAX_WASTE, boqProblem, boqPropertyNames, hasSelector, newArticle, quantityDimension, readBoqArticle, readBoqArticles, unitDimension,
  type BoqArticle, type BoqDimension, type BoqProblem, type BoqProblemKind, type BoqUnit,
} from '../boq.js';
export { boqMissing, computeBoq, declared, picks, type BoqElement, type BoqElementRef, type BoqLine, type BoqMissing, type BoqQuantity, type BoqResult, type BoqTypeLine } from '../boq-compute.js';
export {
  LIST_COUNT_ID, listExportTable, listFigureKind, listScheduleTable, readListScheduleDef,
  type ListCell, type ListFigureKind, type ListScheduleColumn, type ListScheduleDef, type ListScheduleTable, type ListTableSource,
} from '../list-schedule.js';
export { withListClassification, withOfficeClassification, type ClassifiableListProvider, type ListClassificationContext, type OfficeClassificationAccessor } from '../list-classification.js';
export { boqLineText, boqNotes, boqTable, describeBoqProblem, tidy, boqTypeLabel, type BoqCell, type BoqTable } from '../boq-table.js';
export { csvDelimiter, exportCsv, type ExportCell, type ExportTable, type ScheduleExport } from '../schedule-csv.js';
export { LIST_WORDS_EN, LIST_WORDS_RO, listWordsFor } from '../list-words.js';
export { BOQ_WORDS_EN, BOQ_WORDS_RO, boqSayFor, fillTemplate, type BoqSay, type BoqWordKey } from '../boq-words.js';
export {
  checkSubReports, elementCount, isClean, keepId, occurrenceMarkOf, partsOf, subReportCheckOf, subReportChecksOf, subReportParams, typeLabel, type CheckEntry, type CheckOccurrence, type CheckPart, type DuplicateType, type ElementRef,
  type GapType, type MarkOf, type PartRef, type ReviewElement, type ReviewStatus, type SubReportCheck, type SubReportFix,
} from '../sub-report-check.js';
export {
  filterReview, keepApart, placeTypes, placeTypesOf, resumeChecking, reviewCounts, reviewTypes, type ReviewEdit, type ReviewFilter, type ReviewType,
} from '../sub-report-review.js';
export {
  canSplit, MAX_KEPT_APART, readKeptApart, readSchedule, readScheduleClassification, readSubReport, readSubReportFilter, scheduleFilterProperties, scheduleOf, subReportData, subReportsOf,
  type ProjectSchedule, type ScheduleClassification, type ScheduleListKind, type SplitData, type SplitEntry, type SubReport, type SubReportFilter,
} from '../sub-reports.js';
export {
  EXTERIOR, INTERIOR, PROPERTY_OPS, filterPropertyNames, isOpenFilter, passesElementFilter, passesPropertyTest, predefinedTypeText, propertyValueText, readPropertyTest,
  type OccurrenceFacts, type PropertyFact, type PropertyOp, type PropertyTest,
} from '../schedule-filter.js';
export {
  MARK_SCHEMES, MAX_START, ROW_IDS, SORTS, applyContent, contentOf, followedTags, orderedRows, readScheduleContent, shownRows, symbolsShown, textRowId,
  type ContentEntry, type RowId, type ScheduleContent, type ScheduleNumbering, type ScheduleSymbols, type ScheduleRows, type ScheduleSort, type SortBy, type TagWrite, type TaggedEntry,
} from '../schedule-content.js';
export {
  DEFAULT_JOINERY_MAPPING, fitToElement, normaliseName, readJoineryMapping, resolveMapping,
  type ElementFacts, type JoineryMapping, type MappingMatch, type MappingSource,
} from '../joinery-mapping.js';
export {
  addTextRow, cleanText, MAX_LABEL_LENGTH, MAX_TEXT_LENGTH, MAX_TEXT_ROWS, orphanCells, readScheduleTextRows, removeTextRow, renameTextRow, setTextCell, textCellText, textOwner, textRowsOf,
  type OrphanCell, type ScheduleTextCell, type ScheduleTextRow, type TextHolder,
} from '../schedule-text.js';
// Rooms and their areas (#42): the one rule for which space is a room and what its area is, and the room and area schedule built on it
export { ROOM_AREA_NAMES, ROOM_AREA_QTO, meshFootprintArea, meshFootprintPerimeter, pickArea, roomArea, spaceRole, type AreaSource, type FootprintMesh, type RoomArea, type SpaceRole } from '../room-areas.js';
export {
  ROOM_SCHEDULE_EN, ROOM_SCHEDULE_RO, roomSchedule, roomScheduleCsv, roomScheduleLines, roomScheduleRows, roomScheduleTable, roomScheduleText, roomScheduleWords,
  type RoomRecord, type RoomSchedule, type RoomScheduleLevel, type RoomScheduleLine, type RoomScheduleWords, type ScheduleLevelInfo,
} from '../room-schedule.js';
export { estimatedAreas, type EstimatedAreas } from '../room-estimates.js';
