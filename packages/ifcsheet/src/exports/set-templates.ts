/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */


/** Set templates, the Romanian permit project (PAC) and the starting set. Add new exports of this area here, not in `../index.ts`. */

// Set templates (#21): a set's sheets as rules, applied to another model
export {
  ANNOTATION_COMMANDS, RULED_SERIES, captureSetTemplate, allPlans, findAllByRule, findByRule, layoutOf, planStoreys, ruleOf, ruledViews,
  type AnnotationCommand, type Annotations, type CaptureInput, type RuledSeries, type ScheduleRule, type SetTemplate, type SheetLayoutRule, type SheetRule, type SlotRule, type ViewRule,
} from '../set-template.js';
export { applySetTemplate, type TemplateSet, type TemplateSetInput } from '../set-template-apply.js';
export { SET_TEMPLATE_FILE_FORMAT, SET_TEMPLATE_FILE_SUFFIX, SET_TEMPLATE_FILE_VERSION, parseSetTemplate, serializeSetTemplate } from '../set-template-file.js';
export { SET_TEMPLATE_EN, describeTemplateNote, type TemplateNote, type TemplateNoteKey } from '../set-template-notes.js';
// The Romanian permit project (PAC, Legea 169/2026 Anexa 2): the items it lists and the set that draws the architecture sheets (#364)
export { PAC_DEFAULT_INTERVENTION, PAC_DEFAULT_MODE, PAC_INTERVENTIONS, PAC_MODES, PAC_ITEMS, pacApplies, pacCoverage, pacScaleAllowed, pacSetTemplate, type PacCoverageContext, type PacCoverageRow, type PacCoverageSheet, type PacIntervention, type PacItem, type PacKind, type PacMode, type PacSheetNames, type PacState } from '../pac-set.js';
export { PAC_RURAL_ITEMS, PAC_RURAL_PAPER, PAC_RURAL_SCALE, PAC_RURAL_STEP_UP, pacRuralSetTemplate } from '../pac-rural-set.js';
export { PAC_OPIS_ORDER, PAC_OPIS_PAPER, pacOpis, pacOpisOf, pacOpisSheet, pacOpisTexts, pacProjectName, pacSubmissionSheets, type PacOpis, type PacOpisRow, type PacProject, type PacSheetRef } from '../pac-submission.js';
export { pacPages, pacTemplateFor } from '../cli-pac.js';
export { PAC_WORDS_EN, PAC_WORDS_RO, pacWordsFor, type PacWordKey } from '../pac-words.js';
// The starting set (pure: an opened model's facts in, a document out)
export { SET_SECTIONS, generateDefaultSet, type DefaultSet, type DefaultSetOptions, type SetModel, type SetNote } from '../default-set.js';
// The Norwegian permit drawings (byggesak, SAK10 § 5-4): the items with their sources and the set that draws them (#372)
export { NORWAY_DRAWING_SCALE, NORWAY_ITEMS, NORWAY_SITE_SCALE, NORWAY_STEP_UP, norwayCoverage, norwaySetTemplate, type NorwayCoverageRow, type NorwayDrawnBy, type NorwayItem, type NorwaySheetNames, type NorwayState, type NorwayStatus } from '../norway-set.js';
