/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { scanToBimEn } from '../catalogues/scan-to-bim.en';
import { sceneActionsEn } from '../catalogues/scene-actions.en';
import { scheduleExportEn } from '../catalogues/schedule-export.en';
import { scheduleEn } from '../catalogues/schedule.en';
import { scriptPanelEn } from '../catalogues/script-panel.en';
import { searchFiltersEn } from '../catalogues/search-filters.en';
import { searchModalEn } from '../catalogues/search-modal.en';
import { section2dEn } from '../catalogues/section-2d.en';
import { sectionToolEn } from '../catalogues/section-tool.en';
import { semanticIdentityEn } from '../catalogues/semantic-identity.en';
import { semanticResultsEn } from '../catalogues/semantic-results.en';
import { semanticEn } from '../catalogues/semantic.en';
import { setTemplateEn } from '../catalogues/set-template.en';
import { settingsEn } from '../catalogues/settings.en';
import { sharedCommandsEn } from '../catalogues/shared-commands.en';
import { sheetTemplatesEn } from '../catalogues/sheet-templates.en';
import { sheetsPdfEn } from '../catalogues/sheets-pdf.en';
import { sheetsEn } from '../catalogues/sheets.en';
import { shellChromeEn } from '../catalogues/shell-chrome.en';
import { sitePlanEn } from '../catalogues/site-plan.en';
import { sourcesEn } from '../catalogues/sources.en';
import { spaceEnvelopeEn } from '../catalogues/space-envelope.en';
import { splitToolEn } from '../catalogues/split-tool.en';
import { standardsPacksEn } from '../catalogues/standards-packs.en';
import { stairRailingEn } from '../catalogues/stair-railing.en';
import { storeyContextEn } from '../catalogues/storey-context.en';
import { structuralPropertiesEn } from '../catalogues/structural-properties.en';
import { styleRulesEn } from '../catalogues/style-rules.en';
import { sweptDiskInspectionEn } from '../catalogues/swept-disk-inspection.en';
import { tableCorrectionsEn } from '../catalogues/table-corrections.en';
import { tagFieldsEn } from '../catalogues/tag-fields.en';
import { terrainImageryEn } from '../catalogues/terrain-imagery.en';
import { titleBlockParamsEn } from '../catalogues/title-block-params.en';
import { titleBlockRoEn } from '../catalogues/title-block-ro.en';
import { titleBlockSourcesEn } from '../catalogues/title-block-sources.en';
import { toursEn } from '../catalogues/tours.en';
import { trimExtendEn } from '../catalogues/trim-extend.en';
import { unitsNumbersEn } from '../catalogues/units-numbers.en';
import { urbanEn } from '../catalogues/urban.en';
import { validationEditorEn } from '../catalogues/validation-editor.en';
import { validationPanelEn } from '../catalogues/validation-panel.en';
import { viewGraphicsEn } from '../catalogues/view-graphics.en';
import { viewTemplatesEn } from '../catalogues/view-templates.en';
import { viewerShellEn } from '../catalogues/viewer-shell.en';
import { viewportLightingEn } from '../catalogues/viewport-lighting.en';
import { visibilityReasonsEn } from '../catalogues/visibility-reasons.en';
import { wallArrangeEn } from '../catalogues/wall-arrange.en';
import { wallExitsEn } from '../catalogues/wall-exits.en';
import { wallFindEn } from '../catalogues/wall-find.en';
import { wallZoomEn } from '../catalogues/wall-zoom.en';
import { wallKeyPresetsEn } from '../catalogues/wall-key-presets.en';
import { wallKeysEn } from '../catalogues/wall-keys.en';
import { wallMaterialsEn } from '../catalogues/wall-materials.en';
import { wallReviewEn } from '../catalogues/wall-review.en';
import { wallSectionsEn } from '../catalogues/wall-sections.en';
import { wallEn } from '../catalogues/wall.en';
import { webgpuTroubleshootingEn } from '../catalogues/webgpu-troubleshooting.en';
import { whatChangedEn } from '../catalogues/whatchanged.en';
import { zonesPanelEn } from '../catalogues/zones-panel.en';

/** The catalogues whose file starts with `s` to `z` (#144): a sub-barrel keeps the barrel under the module-size limit, and adding a catalogue touches one of them. Static imports, so `TranslationKey` sees every key. */
export const enSZ = {
  ...scanToBimEn,
  ...sceneActionsEn,
  ...scheduleExportEn,
  ...scheduleEn,
  ...scriptPanelEn,
  ...searchFiltersEn,
  ...searchModalEn,
  ...section2dEn,
  ...sectionToolEn,
  ...semanticIdentityEn,
  ...semanticResultsEn,
  ...semanticEn,
  ...setTemplateEn,
  ...settingsEn,
  ...sharedCommandsEn,
  ...sheetTemplatesEn,
  ...sheetsPdfEn,
  ...sheetsEn,
  ...shellChromeEn,
  ...sitePlanEn,
  ...sourcesEn,
  ...spaceEnvelopeEn,
  ...splitToolEn,
  ...standardsPacksEn,
  ...stairRailingEn,
  ...storeyContextEn,
  ...structuralPropertiesEn,
  ...styleRulesEn,
  ...sweptDiskInspectionEn,
  ...tableCorrectionsEn,
  ...tagFieldsEn,
  ...terrainImageryEn,
  ...titleBlockParamsEn,
  ...titleBlockRoEn,
  ...titleBlockSourcesEn,
  ...toursEn,
  ...trimExtendEn,
  ...unitsNumbersEn,
  ...urbanEn,
  ...validationEditorEn,
  ...validationPanelEn,
  ...viewGraphicsEn,
  ...viewTemplatesEn,
  ...viewerShellEn,
  ...viewportLightingEn,
  ...visibilityReasonsEn,
  ...wallArrangeEn,
  ...wallExitsEn,
  ...wallFindEn,
  ...wallZoomEn,
  ...wallKeyPresetsEn,
  ...wallKeysEn,
  ...wallMaterialsEn,
  ...wallReviewEn,
  ...wallSectionsEn,
  ...wallEn,
  ...webgpuTroubleshootingEn,
  ...whatChangedEn,
  ...zonesPanelEn,
} as const;
