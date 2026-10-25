/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Romanian (#53): the IfcSheet face, i.e. the Wall, the project drawer, the
 * sheet cards, the title block, the scales and the tool rail, plus the
 * checks, issue and what-changed panels the Wall opens, the names it gives
 * what it creates, the privacy notice, comments, revisions, the preview at paper size and the tag fields. The 3D viewer
 * around it stays English until its catalogues are translated; a key
 * missing here falls back to English one by one. Term choices: `../ro-glossary.md`.
 */
import type { Catalogue } from '../registry';
import { annotateAllRo } from '../catalogues/annotate-all.ro';
import { annotateSetRo } from '../catalogues/annotate-set.ro';
import { annotatedIfcRo } from '../catalogues/annotated-ifc.ro';
import { boqRo } from '../catalogues/boq.ro';
import { cadLayersRo } from '../catalogues/cad-layers.ro';
import { catalogueRo } from '../catalogues/catalogue.ro';
import { checkRo } from '../catalogues/check.ro';
import { classificationRo } from '../catalogues/classification.ro';
import { colourSchemeRo } from '../catalogues/colour-scheme.ro';
import { cutawayAxoRo } from '../catalogues/cutaway-axo.ro';
import { draftingRo } from '../catalogues/drafting.ro';
import { elementGraphicsRo } from '../catalogues/element-graphics.ro';
import { faceRo } from '../catalogues/face.ro';
import { featuresRo } from '../catalogues/features.ro';
import { handoverRo } from '../catalogues/handover.ro';
import { issueChangesRo } from '../catalogues/issue-changes.ro';
import { issueRo } from '../catalogues/issue.ro';
import { keyboardShortcutsRo } from '../catalogues/keyboard-shortcuts.ro';
import { listScheduleRo } from '../catalogues/list-schedule.ro';
import { namesRo } from '../catalogues/names.ro';
import { printPreviewRo } from '../catalogues/print-preview.ro';
import { reviewRo } from '../catalogues/review.ro';
import { revisionsRo } from '../catalogues/revisions.ro';
import { roomScheduleRo } from '../catalogues/room-schedule.ro';
import { scheduleExportRo } from '../catalogues/schedule-export.ro';
import { setTemplateRo } from '../catalogues/set-template.ro';
import { sheetContentRo } from '../catalogues/sheet-content.ro';
import { sheetTablesRo } from '../catalogues/sheet-tables.ro';
import { sheetTemplatesRo } from '../catalogues/sheet-templates.ro';
import { sheetsRo } from '../catalogues/sheets.ro';
import { styleRulesRo } from '../catalogues/style-rules.ro';
import { tagFieldsRo } from '../catalogues/tag-fields.ro';
import { titleBlockParamsRo } from '../catalogues/title-block-params.ro';
import { titleBlockRoRo } from '../catalogues/title-block-ro.ro';
import { titleBlockSourcesRo } from '../catalogues/title-block-sources.ro';
import { toursRo } from '../catalogues/tours.ro';
import { unitsNumbersRo } from '../catalogues/units-numbers.ro';
import { viewTemplatesRo } from '../catalogues/view-templates.ro';
import { wallArrangeRo } from '../catalogues/wall-arrange.ro';
import { wallExitsRo } from '../catalogues/wall-exits.ro';
import { wallKeyPresetsRo } from '../catalogues/wall-key-presets.ro';
import { wallKeysRo } from '../catalogues/wall-keys.ro';
import { wallReviewRo } from '../catalogues/wall-review.ro';
import { wallSectionsRo } from '../catalogues/wall-sections.ro';
import { wallRo } from '../catalogues/wall.ro';
import { whatChangedRo } from '../catalogues/whatchanged.ro';

export default {
  ...annotateAllRo,
  ...annotateSetRo,
  ...annotatedIfcRo,
  ...boqRo,
  ...cadLayersRo,
  ...catalogueRo,
  ...checkRo,
  ...classificationRo,
  ...colourSchemeRo,
  ...cutawayAxoRo,
  ...draftingRo,
  ...elementGraphicsRo,
  ...faceRo,
  ...featuresRo,
  ...handoverRo,
  ...issueChangesRo,
  ...issueRo,
  ...keyboardShortcutsRo,
  ...listScheduleRo,
  ...namesRo,
  ...printPreviewRo,
  ...reviewRo,
  ...revisionsRo,
  ...roomScheduleRo,
  ...scheduleExportRo,
  ...setTemplateRo,
  ...sheetContentRo,
  ...sheetTablesRo,
  ...sheetTemplatesRo,
  ...sheetsRo,
  ...styleRulesRo,
  ...tagFieldsRo,
  ...titleBlockParamsRo,
  ...titleBlockRoRo,
  ...titleBlockSourcesRo,
  ...toursRo,
  ...unitsNumbersRo,
  ...viewTemplatesRo,
  ...wallArrangeRo,
  ...wallExitsRo,
  ...wallKeyPresetsRo,
  ...wallKeysRo,
  ...wallReviewRo,
  ...wallSectionsRo,
  ...wallRo,
  ...whatChangedRo,
} satisfies Catalogue;
