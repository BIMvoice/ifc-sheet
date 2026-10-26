/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { namesRo } from '../catalogues/names.ro';
import { pacRo } from '../catalogues/pac.ro';
import { printPreviewRo } from '../catalogues/print-preview.ro';
import { reviewRo } from '../catalogues/review.ro';
import { revisionsRo } from '../catalogues/revisions.ro';
import { roomScheduleRo } from '../catalogues/room-schedule.ro';
import { roomSummaryRo } from '../catalogues/room-summary.ro';
import { scheduleExportRo } from '../catalogues/schedule-export.ro';
import { setTemplateRo } from '../catalogues/set-template.ro';
import { sheetContentRo } from '../catalogues/sheet-content.ro';
import { sheetTablesRo } from '../catalogues/sheet-tables.ro';
import { sheetTemplatesRo } from '../catalogues/sheet-templates.ro';
import { sheetsRo } from '../catalogues/sheets.ro';
import { standardsPacksRo } from '../catalogues/standards-packs.ro';
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
import { wallMaterialsRo } from '../catalogues/wall-materials.ro';
import { wallReviewRo } from '../catalogues/wall-review.ro';
import { wallSectionsRo } from '../catalogues/wall-sections.ro';
import { wallRo } from '../catalogues/wall.ro';
import { whatChangedRo } from '../catalogues/whatchanged.ro';

/** The catalogues whose file starts with `m` to `z` (#144): a sub-barrel keeps the barrel under the module-size limit, and adding a catalogue touches one of them. Static imports, so `TranslationKey` sees every key. */
export const roMZ = {
  ...namesRo,
  ...pacRo,
  ...printPreviewRo,
  ...reviewRo,
  ...revisionsRo,
  ...roomScheduleRo,
  ...roomSummaryRo,
  ...scheduleExportRo,
  ...setTemplateRo,
  ...sheetContentRo,
  ...sheetTablesRo,
  ...sheetTemplatesRo,
  ...sheetsRo,
  ...standardsPacksRo,
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
  ...wallMaterialsRo,
  ...wallReviewRo,
  ...wallSectionsRo,
  ...wallRo,
  ...whatChangedRo,
} as const;
