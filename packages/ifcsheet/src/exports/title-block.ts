/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */


/** The title block: layout, parameters, sources, revisions, the standard and the Romanian block, and text measuring. Add new exports of this area here, not in `../index.ts`. */

// The title block's layout, parameters and printing
export { printTitleBlock, sheetFields, sheetLookup, titleBlockMisfits, type TitleBlockMisfit } from '../title-block-print.js';
export { sheetScaleLine, sheetScaleText } from '../sheet-scale.js';
export { LOGO_FIELD, LOGO_MAX_BYTES, TITLE_BLOCK_FIELDS, titleBlockOf, type TitleBlockField } from '../title-block-fields.js';
export {
  DEFAULT_SOURCES, effectiveFields, isPlaceholder, MODEL_ENTITIES, OWNER_PARTS, PRESET_SOURCES, projectTitleFields, readTitleSources, resolveField, resolvedTitleBlock, resolveTitleBlock,
  sameSource, sourcesOf, sourceText, withSources,
  type ModelEntity, type ModelFacts as TitleBlockFacts, type OwnerPart, type ResolvedField, type TitleSource, type TitleSources,
} from '../title-block-sources.js';
export { readStoreFacts, SILENT_FACTS, type FactOverrides } from '../title-block-records.js';
export { cloudRevisionId, currentRevisionOf, REVISION_ID_PARAM, sheetRevisions, type CurrentRevision, type ProjectRevision, type RevisionDraft, type RevisionSource } from '../revisions.js';
export { DEFAULT_SHEET_TYPE, DEFAULT_SHEET_WEIGHTS, DEFAULT_TITLE_BLOCK_METRICS, standardTitleBlock, STANDARD_CAPTIONS_EN, type StandardCaption, type TitleBlockMetrics } from '../title-block-standard.js';
export { BUILTIN_PARAMS, FIELD_PARAMS, fieldBuiltins, paramLookup, resolveParamText, SOFT_BUILTINS, TOKEN, type BuiltinParam, type TitleBlockParam } from '../title-block-params.js';
export { fitCell, fitText, ITEM_KINDS, MAX_CELL_LINES, MAX_TEXT, TEXT_FIT_MIN, type CellLine, type FittedCell, type TemplateItem, type TemplateLine, type TemplateLogo, type TemplateRect, type TemplateText, type TitleBlockTemplate } from '../title-block-template.js';
export { textWidthEm, truncateToWidth } from '../text-width.js';
export { readTitleBlockTemplate } from '../title-block-template-read.js';
export { checkParamName, PARAM_NAME, readSheetParams, readTitleBlock, readTitleBlockParams, type ParamNameProblem } from '../title-block-file-read.js';
export { RO_COLUMNS, RO_ONLY_CAPTIONS_EN, RO_ROWS, TITLE_BLOCK_CAPTIONS_RO, romanianTitleBlock, type RoCaption, type RoOnlyCaption } from '../title-block-ro.js';
