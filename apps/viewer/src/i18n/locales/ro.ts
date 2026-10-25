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
import { checkRo } from '../catalogues/check.ro';
import { faceRo } from '../catalogues/face.ro';
import { sheetTablesRo } from '../catalogues/sheet-tables.ro';
import { namesRo } from '../catalogues/names.ro';
import { issueRo } from '../catalogues/issue.ro';
import { sheetContentRo } from '../catalogues/sheet-content.ro';
import { sheetsRo } from '../catalogues/sheets.ro';
import { wallRo } from '../catalogues/wall.ro';
import { wallKeysRo } from '../catalogues/wall-keys.ro';
import { wallReviewRo } from '../catalogues/wall-review.ro';
import { wallSectionsRo } from '../catalogues/wall-sections.ro';
import { scheduleExportRo } from '../catalogues/schedule-export.ro';
import { whatChangedRo } from '../catalogues/whatchanged.ro';
import { featuresRo } from '../catalogues/features.ro';
import { titleBlockSourcesRo } from '../catalogues/title-block-sources.ro';
import { titleBlockRoRo } from '../catalogues/title-block-ro.ro';
import { wallArrangeRo } from '../catalogues/wall-arrange.ro';
import { revisionsRo } from '../catalogues/revisions.ro';
import { catalogueRo } from '../catalogues/catalogue.ro';
import { cadLayersRo } from '../catalogues/cad-layers.ro';
import { colourSchemeRo } from '../catalogues/colour-scheme.ro';
import { toursRo } from '../catalogues/tours.ro';
import { reviewRo } from '../catalogues/review.ro';
import { printPreviewRo } from '../catalogues/print-preview.ro';
import { tagFieldsRo } from '../catalogues/tag-fields.ro';
import { titleBlockParamsRo } from '../catalogues/title-block-params.ro';

export default {
  ...wallRo,
  ...wallKeysRo,
  ...wallReviewRo,
  ...wallSectionsRo,
  ...scheduleExportRo,
  ...sheetsRo,
  ...checkRo,
  ...issueRo,
  ...whatChangedRo,
  ...sheetContentRo,
  ...namesRo,
  ...faceRo,
  ...sheetTablesRo,
  ...featuresRo,
  ...titleBlockSourcesRo,
  ...titleBlockRoRo,
  ...wallArrangeRo,
  ...revisionsRo,
  ...catalogueRo,
  ...cadLayersRo,
  ...colourSchemeRo,
  ...titleBlockParamsRo,
  ...reviewRo,
  ...toursRo,
  ...printPreviewRo,
  ...tagFieldsRo,
} satisfies Catalogue;
