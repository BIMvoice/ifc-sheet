/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { manualValidationRo } from '../catalogues/manual-validation.ro';
import { measuredQuantitiesRo } from '../catalogues/measured-quantities.ro';
import { miscPanelsBRo } from '../catalogues/misc-panels-b.ro';
import { miscReachableRo } from '../catalogues/misc-reachable.ro';
import { mutationPermissionRo } from '../catalogues/mutation-permission.ro';
import { namesRo } from '../catalogues/names.ro';
import { norwayRo } from '../catalogues/norway.ro';
import { onboardingRo } from '../catalogues/onboarding.ro';
import { pacRo } from '../catalogues/pac.ro';
import { panelTitlesRo } from '../catalogues/panel-titles.ro';
import { phasesRo } from '../catalogues/phases.ro';
import { printPreviewRo } from '../catalogues/print-preview.ro';
import { profileSectionRo } from '../catalogues/profile-section.ro';
import { projectPackageRo } from '../catalogues/project-package.ro';
import { remeshRo } from '../catalogues/remesh.ro';
import { reviewRo } from '../catalogues/review.ro';
import { revisionsRo } from '../catalogues/revisions.ro';
import { roofRo } from '../catalogues/roof.ro';
import { roomScheduleRo } from '../catalogues/room-schedule.ro';
import { roomSummaryRo } from '../catalogues/room-summary.ro';
import { scheduleExportRo } from '../catalogues/schedule-export.ro';
import { selectionBarRo } from '../catalogues/selection-bar.ro';
import { setTemplateRo } from '../catalogues/set-template.ro';
import { settingsRo } from '../catalogues/settings.ro';
import { sharedCommandsRo } from '../catalogues/shared-commands.ro';
import { sheetContentRo } from '../catalogues/sheet-content.ro';
import { sheetTablesRo } from '../catalogues/sheet-tables.ro';
import { sheetTemplatesRo } from '../catalogues/sheet-templates.ro';
import { sheetsPdfRo } from '../catalogues/sheets-pdf.ro';
import { sheetsRo } from '../catalogues/sheets.ro';
import { shellChromeRo } from '../catalogues/shell-chrome.ro';
import { splitToolRo } from '../catalogues/split-tool.ro';
import { standardsPacksRo } from '../catalogues/standards-packs.ro';
import { styleRulesRo } from '../catalogues/style-rules.ro';
import { tagFieldsRo } from '../catalogues/tag-fields.ro';
import { titleBlockParamsRo } from '../catalogues/title-block-params.ro';
import { titleBlockRoRo } from '../catalogues/title-block-ro.ro';
import { titleBlockSourcesRo } from '../catalogues/title-block-sources.ro';
import { toursRo } from '../catalogues/tours.ro';
import { unitsNumbersRo } from '../catalogues/units-numbers.ro';
import { viewTemplatesRo } from '../catalogues/view-templates.ro';
import { viewerShellRo } from '../catalogues/viewer-shell.ro';
import { visibilityReasonsRo } from '../catalogues/visibility-reasons.ro';
import { wallArrangeRo } from '../catalogues/wall-arrange.ro';
import { wallExitsRo } from '../catalogues/wall-exits.ro';
import { wallKeyPresetsRo } from '../catalogues/wall-key-presets.ro';
import { wallKeysRo } from '../catalogues/wall-keys.ro';
import { wallMaterialsRo } from '../catalogues/wall-materials.ro';
import { wallReviewRo } from '../catalogues/wall-review.ro';
import { wallSectionsRo } from '../catalogues/wall-sections.ro';
import { wallRelayoutRo } from '../catalogues/wall-relayout.ro';
import { underlayRo } from '../catalogues/underlay.ro';
import { wallZoomRo } from '../catalogues/wall-zoom.ro';
import { wallCompareRo } from '../catalogues/wall-compare.ro';
import { wallRo } from '../catalogues/wall.ro';
import { whatChangedRo } from '../catalogues/whatchanged.ro';

/** The catalogues whose file starts with `m` to `z` (#144): a sub-barrel keeps the barrel under the module-size limit, and adding a catalogue touches one of them. Static imports, so `TranslationKey` sees every key. */
export const roMZ = {
  ...manualValidationRo,
  ...measuredQuantitiesRo,
  ...miscPanelsBRo,
  ...miscReachableRo,
  ...mutationPermissionRo,
  ...namesRo,
  ...norwayRo,
  ...onboardingRo,
  ...pacRo,
  ...panelTitlesRo,
  ...phasesRo,
  ...printPreviewRo,
  ...profileSectionRo,
  ...projectPackageRo,
  ...remeshRo,
  ...reviewRo,
  ...revisionsRo,
  ...roofRo,
  ...roomScheduleRo,
  ...roomSummaryRo,
  ...scheduleExportRo,
  ...selectionBarRo,
  ...setTemplateRo,
  ...settingsRo,
  ...sharedCommandsRo,
  ...sheetContentRo,
  ...sheetTablesRo,
  ...sheetTemplatesRo,
  ...sheetsPdfRo,
  ...sheetsRo,
  ...shellChromeRo,
  ...splitToolRo,
  ...standardsPacksRo,
  ...styleRulesRo,
  ...tagFieldsRo,
  ...titleBlockParamsRo,
  ...titleBlockRoRo,
  ...titleBlockSourcesRo,
  ...toursRo,
  ...unitsNumbersRo,
  ...viewTemplatesRo,
  ...viewerShellRo,
  ...visibilityReasonsRo,
  ...wallArrangeRo,
  ...wallExitsRo,
  ...wallKeyPresetsRo,
  ...wallKeysRo,
  ...wallMaterialsRo,
  ...wallReviewRo,
  ...wallSectionsRo,
  ...wallRelayoutRo,
  ...underlayRo,
  ...wallZoomRo,
  ...wallCompareRo,
  ...wallRo,
  ...whatChangedRo,
} as const;
