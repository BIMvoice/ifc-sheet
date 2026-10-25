/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { enA } from './barrels/en-a';
import { manualValidationEn } from './catalogues/manual-validation.en';
import { materialsEn } from './catalogues/materials.en';
import { mcpPlaygroundEn } from './catalogues/mcp-playground.en';
import { mcpEn } from './catalogues/mcp.en';
import { measureEn } from './catalogues/measure.en';
import { mergeLayersBannerEn } from './catalogues/merge-layers-banner.en';
import { miscPanelsAEn } from './catalogues/misc-panels-a.en';
import { miscPanelsBEn } from './catalogues/misc-panels-b.en';
import { modelAuthoringEn } from './catalogues/model-authoring.en';
import { modelChangesEn } from './catalogues/model-changes.en';
import { modelInspectorEn } from './catalogues/model-inspector.en';
import { modelWorkspaceEn } from './catalogues/model-workspace.en';
import { modelingCommandEn } from './catalogues/modeling-command.en';
import { moveRotateEn } from './catalogues/move-rotate.en';
import { multiSplitEn } from './catalogues/multi-split.en';
import { mutationPermissionEn } from './catalogues/mutation-permission.en';
import { namesEn } from './catalogues/names.en';
import { newProjectEn } from './catalogues/new-project.en';
import { panelNoModelEn } from './catalogues/panel-no-model.en';
import { phasesEn } from './catalogues/phases.en';
import { placementPanelEn } from './catalogues/placement-panel.en';
import { planHandlesEn } from './catalogues/plan-handles.en';
import { printPreviewEn } from './catalogues/print-preview.en';
import { profileSectionEn } from './catalogues/profile-section.en';
import { profilesEn } from './catalogues/profiles.en';
import { projectNavigatorEn } from './catalogues/project-navigator.en';
import { projectPackageEn } from './catalogues/project-package.en';
import { projectVersionsEn } from './catalogues/project-versions.en';
import { propertiesPanelEn } from './catalogues/properties-panel.en';
import { propertiesSelectionEn } from './catalogues/properties-selection.en';
import { propertiesEn } from './catalogues/properties.en';
import { propertyEditorEn } from './catalogues/property-editor.en';
import { pushPullAlignEn } from './catalogues/push-pull-align.en';
import { relationshipCardEn } from './catalogues/relationship-card.en';
import { relocateEn } from './catalogues/relocate.en';
import { remeshEn } from './catalogues/remesh.en';
import { repositionPanelEn } from './catalogues/reposition-panel.en';
import { resultViewEn } from './catalogues/result-view.en';
import { reviewEn } from './catalogues/review.en';
import { revisionsEn } from './catalogues/revisions.en';
import { ribbonToolbarEn } from './catalogues/ribbon-toolbar.en';
import { roofBlockEn } from './catalogues/roof-block.en';
import { roofEn } from './catalogues/roof.en';
import { roomFinishesEn } from './catalogues/room-finishes.en';
import { roomLayoutEn } from './catalogues/room-layout.en';
import { roomScheduleEn } from './catalogues/room-schedule.en';
import { roomToolEn } from './catalogues/room-tool.en';
import { scanToBimEn } from './catalogues/scan-to-bim.en';
import { sceneActionsEn } from './catalogues/scene-actions.en';
import { scheduleExportEn } from './catalogues/schedule-export.en';
import { scheduleEn } from './catalogues/schedule.en';
import { scriptPanelEn } from './catalogues/script-panel.en';
import { searchFiltersEn } from './catalogues/search-filters.en';
import { searchModalEn } from './catalogues/search-modal.en';
import { section2dEn } from './catalogues/section-2d.en';
import { sectionToolEn } from './catalogues/section-tool.en';
import { semanticIdentityEn } from './catalogues/semantic-identity.en';
import { semanticResultsEn } from './catalogues/semantic-results.en';
import { semanticEn } from './catalogues/semantic.en';
import { setTemplateEn } from './catalogues/set-template.en';
import { settingsEn } from './catalogues/settings.en';
import { sharedCommandsEn } from './catalogues/shared-commands.en';
import { sheetTemplatesEn } from './catalogues/sheet-templates.en';
import { sheetsPdfEn } from './catalogues/sheets-pdf.en';
import { sheetsEn } from './catalogues/sheets.en';
import { shellChromeEn } from './catalogues/shell-chrome.en';
import { sitePlanEn } from './catalogues/site-plan.en';
import { sourcesEn } from './catalogues/sources.en';
import { spaceEnvelopeEn } from './catalogues/space-envelope.en';
import { splitToolEn } from './catalogues/split-tool.en';
import { stairRailingEn } from './catalogues/stair-railing.en';
import { storeyContextEn } from './catalogues/storey-context.en';
import { structuralPropertiesEn } from './catalogues/structural-properties.en';
import { styleRulesEn } from './catalogues/style-rules.en';
import { sweptDiskInspectionEn } from './catalogues/swept-disk-inspection.en';
import { tableCorrectionsEn } from './catalogues/table-corrections.en';
import { tagFieldsEn } from './catalogues/tag-fields.en';
import { terrainImageryEn } from './catalogues/terrain-imagery.en';
import { titleBlockParamsEn } from './catalogues/title-block-params.en';
import { titleBlockRoEn } from './catalogues/title-block-ro.en';
import { titleBlockSourcesEn } from './catalogues/title-block-sources.en';
import { toursEn } from './catalogues/tours.en';
import { trimExtendEn } from './catalogues/trim-extend.en';
import { unitsNumbersEn } from './catalogues/units-numbers.en';
import { urbanEn } from './catalogues/urban.en';
import { validationEditorEn } from './catalogues/validation-editor.en';
import { validationPanelEn } from './catalogues/validation-panel.en';
import { viewGraphicsEn } from './catalogues/view-graphics.en';
import { viewTemplatesEn } from './catalogues/view-templates.en';
import { viewerShellEn } from './catalogues/viewer-shell.en';
import { viewportLightingEn } from './catalogues/viewport-lighting.en';
import { visibilityReasonsEn } from './catalogues/visibility-reasons.en';
import { wallArrangeEn } from './catalogues/wall-arrange.en';
import { wallExitsEn } from './catalogues/wall-exits.en';
import { wallFindEn } from './catalogues/wall-find.en';
import { wallKeyPresetsEn } from './catalogues/wall-key-presets.en';
import { wallKeysEn } from './catalogues/wall-keys.en';
import { wallReviewEn } from './catalogues/wall-review.en';
import { wallSectionsEn } from './catalogues/wall-sections.en';
import { wallEn } from './catalogues/wall.en';
import { webgpuTroubleshootingEn } from './catalogues/webgpu-troubleshooting.en';
import { whatChangedEn } from './catalogues/whatchanged.en';
import { zonesPanelEn } from './catalogues/zones-panel.en';

/** English is assembled from feature catalogues so no locale becomes a monolith. */
export const en = {
  ...enA,
  ...manualValidationEn,
  ...materialsEn,
  ...mcpPlaygroundEn,
  ...mcpEn,
  ...measureEn,
  ...mergeLayersBannerEn,
  ...miscPanelsAEn,
  ...miscPanelsBEn,
  ...modelAuthoringEn,
  ...modelChangesEn,
  ...modelInspectorEn,
  ...modelWorkspaceEn,
  ...modelingCommandEn,
  ...moveRotateEn,
  ...multiSplitEn,
  ...mutationPermissionEn,
  ...namesEn,
  ...newProjectEn,
  ...panelNoModelEn,
  ...phasesEn,
  ...placementPanelEn,
  ...planHandlesEn,
  ...printPreviewEn,
  ...profileSectionEn,
  ...profilesEn,
  ...projectNavigatorEn,
  ...projectPackageEn,
  ...projectVersionsEn,
  ...propertiesPanelEn,
  ...propertiesSelectionEn,
  ...propertiesEn,
  ...propertyEditorEn,
  ...pushPullAlignEn,
  ...relationshipCardEn,
  ...relocateEn,
  ...remeshEn,
  ...repositionPanelEn,
  ...resultViewEn,
  ...reviewEn,
  ...revisionsEn,
  ...ribbonToolbarEn,
  ...roofBlockEn,
  ...roofEn,
  ...roomFinishesEn,
  ...roomLayoutEn,
  ...roomScheduleEn,
  ...roomToolEn,
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
  ...wallKeyPresetsEn,
  ...wallKeysEn,
  ...wallReviewEn,
  ...wallSectionsEn,
  ...wallEn,
  ...webgpuTroubleshootingEn,
  ...whatChangedEn,
  ...zonesPanelEn,
} as const;

export type TranslationKey = keyof typeof en;
