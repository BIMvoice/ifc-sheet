/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * `@bimvoice/ifcsheet/project`: a saved project and the joinery schedule rows read from models with it (#260).
 * Kept apart from the main entry because it loads the modelling library (`@ifc-lite/create`); part of `/headless`.
 */

export { readJoineryList, readJoinerySpec } from './joinery-spec-read.js';
export {
  FANLIGHT_SHARE, MAX_BARS, MAX_LEAVES, cleanBars, cleanHead, cleanOpening, configureTypeOpening, leafOperations, openingOfSpec, specFromOpening, typeEntryId, typedSillOf,
  type ConfigureTypeInput, type ProjectJoinery, type TypeOpening,
} from './joinery-type-config.js';
export {
  MAX_BLOCK_PATHS, MAX_BLOCK_POINTS, blockPlanStrokes, listDxfBlocks, mirrorsBlock, readDxfBlock, readJoineryBlock, withPlanBlock,
  type BlockStroke, type DxfBlockRead, type DxfBlockReport,
} from './joinery-block-symbol.js';
export {
  JOINERY_VIEW_DETAILS, joineryViewLineId, joineryViewLines, withHiddenLinesShown, withViewDetail, withViewLineHidden,
  type JoineryViewLineLike, type JoineryViewName,
} from './joinery-view-detail.js';
export {
  isJoineryDraftType, joineryViewDraftPrims, joineryViewDrafts, readJoineryViewDrafts, withViewDrafts, type JoineryDraftPrim,
} from './joinery-view-drafts.js';
export {
  attributes, drawnJoineryOf, elementFacts, joineryOfElement, joineryScheduleData, occurrenceMark, storedName, typeIndex,
  type DrawnJoinery, type JoineryElement, type JoineryProject, type Live, type ScheduleData, type ScheduleEntry, type ScheduleKind, type ScheduleModel, type ScheduleOccurrence,
} from './joinery-schedule.js';
export { scheduleModelsOf, type OpenedScheduleSource } from './schedule-models.js';
export { discoverModelRows, mergeFound, readModelRowCells, readModelRowValues, type ModelRowCells, type FoundModelRows, type ModelRowSource } from './joinery-model-values.js';
export { projectSubReportChecks, readProjectFile, readinessWithProject, type ProjectFacts } from './project-read.js';
export { boqScales, boqQuantities, materialNamesOf, readBoqElements, storeSource, type BoqScales, type BoqSource } from './boq-read.js';
export { storeClassifications } from './classification-read.js';
