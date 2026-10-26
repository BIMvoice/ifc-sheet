/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * @bimvoice/ifcsheet: the IfcSheet drawing-set engine.
 *
 * The project document's drawing-set part is the contract (`document.ts`).
 * The pure layout makes a set from views and a model's extent; the headless
 * chain opens an IFC, lays out the starting set and writes it as PDF and DXF,
 * in Node or in the browser. The web app (`apps/viewer`) is a client: its
 * stores call into these functions and keep the UI state.
 *
 *     import { generateDefaultSet } from '@bimvoice/ifcsheet';
 *     import { exportDxf, exportPdf, openModel, sheetGraphics } from '@bimvoice/ifcsheet/headless';
 *
 *     const model = await openModel(bytes);
 *     const set = generateDefaultSet(model);
 *     const sheets = await sheetGraphics(set, model);
 *     const pdf = await exportPdf(sheets);
 *     const dxf = sheets.map(exportDxf);
 */

// The document
export type {
  AxonometricPreset, CameraViewpoint, CategoryGraphics, CategoryLineWeight, CustomPaper, DisciplineId, DraftingProjectView,
  ElevationDirection, ElevationProjectView, ElongatedPaper, GridEnds, GroupPattern, InteriorElevation, NumberGroup, NumberingScheme,
  Paper, PaperSize, PhaseId, PhaseStyle, PlanProjectView, ProjectDocument, ProjectionMode, ProjectLevel, ProjectModelRef, ProjectSheet,
  ProjectView, ProjectViewBase, ProjectViewKind, SectionCustomPlane, SectionPlaneAxis, SectionProjectPlane, SectionProjectView,
  SheetFrame, SheetTemplate, SheetViewport, TemplateSeries, ThreeDProjection, ThreeDProjectView, TitleBlockPosition, ViewDetail,
  ViewGraphics, ViewGridGraphics, ViewPhases, ViewRaster, ProjectViewTemplate, TemplateGraphics, ViewTemplateKind,
  ElementGraphics, ElementLineStyle, GlobalId, ResolvedViewGraphics, StyleRule, StyleRuleStyle,
} from './document.js';

// A view template's class and material mapping (#31)
export {
  CLASSIFICATION_BY, classificationOf, classifiedTypes, mappingsFor, matchKey, parseClassificationRows, readClassificationMapping, readClassificationMappings, readClassificationRule, classificationRuleOf, systemLabel, withRule,
  type ClassificationBy, type ClassificationImport, type ClassificationMapping, type ClassificationModel, type ClassificationProblem, type ClassificationProblemKind, type ClassificationResult, type ClassificationRule, type ClassificationSystem,
  type ClassifiedElement, type ClassifiedType, type ModelClassificationRef,
} from './classification.js';
export { classKey, itemRules, materialKey, ruleStyleFor, type ItemRules } from './style-rules.js';

// View templates (#44): named graphics many views follow, and the one function that layers them
export {
  VIEW_CATEGORY_CLASSES, VIEW_TEMPLATE_KINDS, assignDefaultTemplates, defaultViewTemplates, hiddenClassesOf, resolveViewGraphics, resolveViewport,
  ownGraphicsOf, templateGraphicsOf, templateKindOf, templateOf, untemplatedGraphics, viewportHiddenLayers,
} from './view-templates.js';

// Single elements in a view (#32, #33): hidden, drawn differently, one line hidden; all by GlobalId
export {
  categoryIdOf, elementShown, hasElementGraphics, hiddenElementIds, hiddenLineElement, hiddenLineEntry, lineHidden, lineKey, orphanElements, resolveElementGraphics, withoutElements,
  type ElementStyle, type OrphanElement,
} from './element-graphics.js';

// The style of every face and line of a view (#34): one styler and one pen table for the drafting view, the sheets and every export
export {
  DASH_MM, DEFAULT_FACE_FILL, DEFAULT_INK, DEFAULT_VIEW_PRESET, HIDDEN_DASH_MM, PEN_TABLE, elementProperties, presetRules, rulesReadProperties, viewOverrideRules, viewStyler,
  type ItemStyle, type PenKind, type PenTable, type StyleItem, type ViewStyleInputs, type ViewStyler, type WeightPair,
} from './view-style.js';
export { penGroups, penOrder, type PenGroup, type PenLayer } from './drawing-pens.js';

// What the model lacks (the counting, `readModelFacts`, is in `/headless` and `/readiness-read`: it loads the parser)
export { READINESS_EN, describeReadiness, modelReadiness, type ModelFacts, type ReadinessFinding, type ReadinessKind } from './readiness.js';

// The bill of quantities (antemasuratoare, #75). Reading it from models is `/project`: it loads the parser.
export {
  BOQ_QUANTITIES, BOQ_UNITS, BOQ_UNIT_TEXT, COUNT_QUANTITY, MAX_WASTE, boqProblem, boqPropertyNames, hasSelector, newArticle, quantityDimension, readBoqArticle, readBoqArticles, unitDimension,
  type BoqArticle, type BoqDimension, type BoqProblem, type BoqProblemKind, type BoqUnit,
} from './boq.js';
export { boqMissing, computeBoq, declared, picks, type BoqElement, type BoqElementRef, type BoqLine, type BoqMissing, type BoqQuantity, type BoqResult, type BoqTypeLine } from './boq-compute.js';
export {
  LIST_COUNT_ID, listExportTable, listFigureKind, listScheduleTable, readListScheduleDef,
  type ListCell, type ListFigureKind, type ListScheduleColumn, type ListScheduleDef, type ListScheduleTable, type ListTableSource,
} from './list-schedule.js';
export { withListClassification, withOfficeClassification, type ClassifiableListProvider, type ListClassificationContext, type OfficeClassificationAccessor } from './list-classification.js';
export { boqLineText, boqNotes, boqTable, describeBoqProblem, tidy, boqTypeLabel, type BoqCell, type BoqTable } from './boq-table.js';
export { csvDelimiter, exportCsv, type ExportCell, type ExportTable, type ScheduleExport } from './schedule-csv.js';
export { LIST_WORDS_EN, LIST_WORDS_RO, listWordsFor } from './list-words.js';
export { BOQ_WORDS_EN, BOQ_WORDS_RO, boqSayFor, fillTemplate, type BoqSay, type BoqWordKey } from './boq-words.js';

// Names
export { ENGINE_NAMES_EN, englishName, nameOf, setNameResolver, type EngineNameKey, type NameParams, type NameResolver } from './names.js';
export { sheetNumber, sheetLevel, sheetFormat, readUnitsAndNumbers, type SheetLocale, type SheetFormat, type UnitsAndNumbers } from './names.js';

// The title block's layout, parameters and printing
export { printTitleBlock, sheetFields, sheetLookup } from './title-block-print.js';
export { LOGO_FIELD, LOGO_MAX_BYTES, TITLE_BLOCK_FIELDS, titleBlockOf, type TitleBlockField } from './title-block-fields.js';
export {
  DEFAULT_SOURCES, effectiveFields, isPlaceholder, MODEL_ENTITIES, OWNER_PARTS, PRESET_SOURCES, projectTitleFields, readTitleSources, resolveField, resolvedTitleBlock, resolveTitleBlock,
  sameSource, sourcesOf, sourceText, withSources,
  type ModelEntity, type ModelFacts as TitleBlockFacts, type OwnerPart, type ResolvedField, type TitleSource, type TitleSources,
} from './title-block-sources.js';
export { readStoreFacts, SILENT_FACTS, type FactOverrides } from './title-block-records.js';
export { cloudRevisionId, currentRevisionOf, REVISION_ID_PARAM, sheetRevisions, type CurrentRevision, type ProjectRevision, type RevisionDraft, type RevisionSource } from './revisions.js';
export { DEFAULT_SHEET_TYPE, DEFAULT_SHEET_WEIGHTS, DEFAULT_TITLE_BLOCK_METRICS, standardTitleBlock, STANDARD_CAPTIONS_EN, type StandardCaption, type TitleBlockMetrics } from './title-block-standard.js';
export { BUILTIN_PARAMS, FIELD_PARAMS, fieldBuiltins, paramLookup, resolveParamText, SOFT_BUILTINS, TOKEN, type BuiltinParam, type TitleBlockParam } from './title-block-params.js';
export { fitText, ITEM_KINDS, TEXT_FIT_MIN, type TemplateItem, type TemplateLine, type TemplateLogo, type TemplateRect, type TemplateText, type TitleBlockTemplate } from './title-block-template.js';
export { textWidthEm, truncateToWidth } from './text-width.js';

// Pure layout
export { freshProjectId } from './ids.js';
export { CUSTOM_MM, ELONGATED_MM, ELONGATED_PAPERS, ISO_PAPERS, PAPER_MM, isCustom, isElongated, paperFromLabel, paperLabel, paperMm, readPaper } from './paper.js';
export { DEFAULT_FRAME, FRAME_MARGIN_MM, MARGIN_MM, TITLE_BLOCK_MM, drawingAreaIn, frameOf, frameProblem, frameRect, readFrame, titleBlockRect, type FrameProblem, type Rect } from './sheet-frame.js';
export { BUILT_IN_TEMPLATES, FILING_MARGIN_MM, allTemplates, findTemplate, readSeriesTemplates, readTemplate, templateFields, templateFromSheet } from './sheet-templates.js';
export {
  DEFAULT_SCHEME, NUMBER_GROUPS, SCHEME_PRESETS, SEQUENTIAL_SCHEME, formatNumber, nextNumber, numberAt, numberGroupOf, numberSheets, planRenumber,
  readNumberingScheme, registerNumberIn, registerSlot, renumbered, typedBeforeSchemes, type OverrideMode, type RenumberRow,
} from './numbering.js';
export {
  checkSubReports, elementCount, isClean, keepId, occurrenceMarkOf, partsOf, subReportCheckOf, subReportChecksOf, subReportParams, typeLabel, type CheckEntry, type CheckOccurrence, type CheckPart, type DuplicateType, type ElementRef,
  type GapType, type MarkOf, type PartRef, type ReviewElement, type ReviewStatus, type SubReportCheck, type SubReportFix,
} from './sub-report-check.js';
export {
  filterReview, keepApart, placeTypes, placeTypesOf, resumeChecking, reviewCounts, reviewTypes, type ReviewEdit, type ReviewFilter, type ReviewType,
} from './sub-report-review.js';
export {
  canSplit, MAX_KEPT_APART, readKeptApart, readSchedule, readScheduleClassification, readSubReport, readSubReportFilter, scheduleFilterProperties, scheduleOf, subReportData, subReportsOf,
  type ProjectSchedule, type ScheduleClassification, type ScheduleListKind, type SplitData, type SplitEntry, type SubReport, type SubReportFilter,
} from './sub-reports.js';
export {
  EXTERIOR, INTERIOR, PROPERTY_OPS, filterPropertyNames, isOpenFilter, passesElementFilter, passesPropertyTest, predefinedTypeText, propertyValueText, readPropertyTest,
  type OccurrenceFacts, type PropertyFact, type PropertyOp, type PropertyTest,
} from './schedule-filter.js';
export {
  MARK_SCHEMES, MAX_START, ROW_IDS, SORTS, applyContent, contentOf, followedTags, orderedRows, readScheduleContent, shownRows, symbolsShown, textRowId,
  type ContentEntry, type RowId, type ScheduleContent, type ScheduleNumbering, type ScheduleSymbols, type ScheduleRows, type ScheduleSort, type SortBy, type TagWrite, type TaggedEntry,
} from './schedule-content.js';
export { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION, declaredVersion } from './project-version.js';
export {
  DEFAULT_JOINERY_MAPPING, fitToElement, normaliseName, readJoineryMapping, resolveMapping,
  type ElementFacts, type JoineryMapping, type MappingMatch, type MappingSource,
} from './joinery-mapping.js';
export {
  addTextRow, cleanText, MAX_LABEL_LENGTH, MAX_TEXT_LENGTH, MAX_TEXT_ROWS, orphanCells, readScheduleTextRows, removeTextRow, renameTextRow, setTextCell, textCellText, textOwner, textRowsOf,
  type OrphanCell, type ScheduleTextCell, type ScheduleTextRow, type TextHolder,
} from './schedule-text.js';
export { SHEET_SCALES, fitViewportBox, mmPerMetre, paperOf } from './viewport-fit.js';
export { paperSigns, placer } from './sheet-graphic.js';
export {
  DEFAULT_PLAN_CUT_HEIGHT_M, ELEVATION_DIRECTIONS, LEVEL_MATCH_TOLERANCE_M, NEXT_FLOOR_CLEARANCE_M, defaultPlanCutHeight, defaultViews, elevationName, levelFloorY, levelsFromStoreys, planDepthBelowCut, planViewFor,
  resolvePlanLevel, sameElevation, syncDefaultViews, uniqueViewName, type StoreyInput,
} from './view-defaults.js';
export { DEPTH_MARGIN_M, ELEVATION_CLEARANCE_M, elevationDepth, elevationPlaneOffset, proposalDepth, type Extent3 } from './set-defaults.js';
export { CUT_OVERHANG_M, SAME_CUT_M, SMALLEST_ROOM_M2, proposeSections, type Footprint, type ProposalInput, type RoomFootprint, type SectionProposal } from './section-proposals.js';
export { customPlaneCenter, sectionPlaneThrough, type WorldPoint } from './section-plane.js';
export {
  PER_SHEET, SET_PAPER, SET_PAPERS, SET_SCALES, TARGET_SCALE, buildDrawingSet, choosePaper, detailedScaleThatFits, drawingArea, fitsScale, fittingScale,
  groundPlan, groupOfView, groupsThatDoNotFit, isSetSheet, overrun, placeViewports, scaleOn, sheetGroup, sheetScaleReason, sheetSeries, viewCentre, viewExtent,
  withViewHung, type Arrangement, type ModelExtent, type Reason, type SetGroup, type SetInput, type SheetLayout,
} from './drawing-set.js';
export { resolveStoreyOriginMeters, storeyFloorY, type Point3 } from './storey-origin.js';
export { boundsFromIndex, createEntityBoundsLookup, getEntityBounds, indexMeshesByEntity, isValidCoord, unionEntityBounds, type BoundingBox3D, type Point3D } from './entity-bounds.js';

export { FRAMING_RULE, boxGap, farElementLabel, frameElements, frameEntities, type FarElement, type FramedElement, type Framing, type FramingOptions } from './framing.js';

// Set templates (#21): a set's sheets as rules, applied to another model
export {
  ANNOTATION_COMMANDS, RULED_SERIES, captureSetTemplate, findByRule, layoutOf, planStoreys, ruleOf, ruledViews,
  type AnnotationCommand, type Annotations, type CaptureInput, type RuledSeries, type ScheduleRule, type SetTemplate, type SheetLayoutRule, type SheetRule, type SlotRule, type ViewRule,
} from './set-template.js';
export { applySetTemplate, type TemplateSet, type TemplateSetInput } from './set-template-apply.js';
export { SET_TEMPLATE_FILE_FORMAT, SET_TEMPLATE_FILE_SUFFIX, SET_TEMPLATE_FILE_VERSION, parseSetTemplate, serializeSetTemplate } from './set-template-file.js';
export { SET_TEMPLATE_EN, describeTemplateNote, type TemplateNote, type TemplateNoteKey } from './set-template-notes.js';

// The Romanian permit project (PAC, Legea 169/2026 Anexa 2): the items it lists and the set that draws the architecture sheets (#364)
export { PAC_ITEMS, pacCoverage, pacScaleAllowed, pacSetTemplate, type PacCoverageRow, type PacItem, type PacKind, type PacSheetNames } from './pac-set.js';

// The starting set (pure: an opened model's facts in, a document out)
export { SET_SECTIONS, generateDefaultSet, type DefaultSet, type DefaultSetOptions, type SetModel, type SetNote } from './default-set.js';

// Opening an IFC, cutting drawings and writing files live in `@bimvoice/ifcsheet/headless` (`headless.ts`),
// so a client of the layout alone (the web app) does not load the parser, the geometry engine or the writers through it.

// Rooms and their areas (#42): the one rule for which space is a room and what its area is, and the room and area schedule built on it
export { ROOM_AREA_NAMES, ROOM_AREA_QTO, meshFootprintArea, meshFootprintPerimeter, pickArea, roomArea, spaceRole, type AreaSource, type FootprintMesh, type RoomArea, type SpaceRole } from './room-areas.js';
export {
  ROOM_SCHEDULE_EN, ROOM_SCHEDULE_RO, roomSchedule, roomScheduleCsv, roomScheduleLines, roomScheduleRows, roomScheduleTable, roomScheduleText, roomScheduleWords,
  type RoomRecord, type RoomSchedule, type RoomScheduleLevel, type RoomScheduleLine, type RoomScheduleWords, type ScheduleLevelInfo,
} from './room-schedule.js';
export { estimatedAreas, type EstimatedAreas } from './room-estimates.js';
