/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { aiReportsEn } from './catalogues/ai-reports.en';
import { alignmentSectionEn } from './catalogues/alignment-section.en';
import { analysisPanelEn } from './catalogues/analysis-panel.en';
import { annotateAllEn } from './catalogues/annotate-all.en';
import { annotateSetEn } from './catalogues/annotate-set.en';
import { annotatedIfcEn } from './catalogues/annotated-ifc.en';
import { annotationsEn } from './catalogues/annotations.en';
import { anonymizedExportEn } from './catalogues/anonymized-export.en';
import { appearanceAssignmentListEn } from './catalogues/appearance-assignment-list.en';
import { appearanceAssignmentMembersEn } from './catalogues/appearance-assignment-members.en';
import { appearancePanelEn } from './catalogues/appearance-panel.en';
import { appearancePickersEn } from './catalogues/appearance-pickers.en';
import { appearanceWorkflowsEn } from './catalogues/appearance-workflows.en';
import { assistantArtifactsEn } from './catalogues/assistant-artifacts.en';
import { assistantPackAutomationEn } from './catalogues/assistant-pack-automation.en';
import { assistantPackChecksEn } from './catalogues/assistant-pack-checks.en';
import { assistantPackCoordinationEn } from './catalogues/assistant-pack-coordination.en';
import { assistantPackMeasureEn } from './catalogues/assistant-pack-measure.en';
import { assistantPackSiteEn } from './catalogues/assistant-pack-site.en';
import { assistantPackTablesEn } from './catalogues/assistant-pack-tables.en';
import { assistantSourcesEn } from './catalogues/assistant-sources.en';
import { assistantUsageEn } from './catalogues/assistant-usage.en';
import { attributeEditorEn } from './catalogues/attribute-editor.en';
import { automationEditorEn } from './catalogues/automation-editor.en';
import { bcfDraftsEn } from './catalogues/bcf-drafts.en';
import { bcfEn } from './catalogues/bcf.en';
import { boqEn } from './catalogues/boq.en';
import { bulkPropertyEditorEn } from './catalogues/bulk-property-editor.en';
import { cadLayersEn } from './catalogues/cad-layers.en';
import { catalogueEn } from './catalogues/catalogue.en';
import { cesiumGeoEn } from './catalogues/cesium-geo.en';
import { changeSetsEn } from './catalogues/change-sets.en';
import { changesPanelEn } from './catalogues/changes-panel.en';
import { chartsEn } from './catalogues/charts.en';
import { chatByokEn } from './catalogues/chat-byok.en';
import { chatEn } from './catalogues/chat.en';
import { checkAuthoringEn } from './catalogues/check-authoring.en';
import { checkReadyEn } from './catalogues/check-ready.en';
import { checkEn } from './catalogues/check.en';
import { civilDrawingsEn } from './catalogues/civil-drawings.en';
import { civilEn } from './catalogues/civil.en';
import { clashGroupApplyEn } from './catalogues/clash-group-apply.en';
import { clashGroupsEn } from './catalogues/clash-groups.en';
import { clashPanelEn } from './catalogues/clash-panel.en';
import { clashToolsEn } from './catalogues/clash-tools.en';
import { colourSchemeEn } from './catalogues/colour-scheme.en';
import { commandPaletteEn } from './catalogues/command-palette.en';
import { commandsEn } from './catalogues/commands.en';
import { compareKeyPropertyEn } from './catalogues/compare-key-property.en';
import { comparePanelEn } from './catalogues/compare-panel.en';
import { copyArrayEn } from './catalogues/copy-array.en';
import { costPanelEn } from './catalogues/cost-panel.en';
import { curtainGridEn } from './catalogues/curtain-grid.en';
import { cutawayAxoEn } from './catalogues/cutaway-axo.en';
import { dataConnectorEn } from './catalogues/data-connector.en';
import { deviationStatsEn } from './catalogues/deviation-stats.en';
import { documentMenuEn } from './catalogues/document-menu.en';
import { documentEn } from './catalogues/document.en';
import { draftSetEn } from './catalogues/draft-set.en';
import { draftingStandardsEn } from './catalogues/drafting-standards.en';
import { draftingEn } from './catalogues/drafting.en';
import { drawingUnderlayEn } from './catalogues/drawing-underlay.en';
import { elementGraphicsEn } from './catalogues/element-graphics.en';
import { elementTypesEn } from './catalogues/element-types.en';
import { exportDialogEn } from './catalogues/export-dialog.en';
import { extensionsFlavorsEn } from './catalogues/extensions-flavors.en';
import { extensionsPanelsEn } from './catalogues/extensions-panels.en';
import { extrusionInspectionEn } from './catalogues/extrusion-inspection.en';
import { feedbackEn } from './catalogues/feedback.en';
import { filterGroupsEn } from './catalogues/filter-groups.en';
import { filterOperatorsEn } from './catalogues/filter-operators.en';
import { flowAssistantEn } from './catalogues/flow-assistant.en';
import { flowPanelEn } from './catalogues/flow-panel.en';
import { flowStartupEn } from './catalogues/flow-startup.en';
import { ganttWorkCalendarEn } from './catalogues/gantt-work-calendar.en';
import { geometryExportDialogsEn } from './catalogues/geometry-export-dialogs.en';
import { georeferencingEn } from './catalogues/georeferencing.en';
import { groupsEn } from './catalogues/groups.en';
import { handoverEn } from './catalogues/handover.en';
import { hierarchyEn } from './catalogues/hierarchy.en';
import { hostedPlaceEn } from './catalogues/hosted-place.en';
import { idsPanelEn } from './catalogues/ids-panel.en';
import { ifcsheetTourEn } from './catalogues/ifcsheet-tour.en';
import { ionUploadEn } from './catalogues/ion-upload.en';
import { issueChangesEn } from './catalogues/issue-changes.en';
import { issueEn } from './catalogues/issue.en';
import { joineryEn } from './catalogues/joinery.en';
import { keyboardShortcutsEn } from './catalogues/keyboard-shortcuts.en';
import { landXmlEn } from './catalogues/landxml.en';
import { layersPanelEn } from './catalogues/layers-panel.en';
import { lensPanelEn } from './catalogues/lens-panel.en';
import { listsEn } from './catalogues/lists.en';
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
  ...aiReportsEn,
  ...alignmentSectionEn,
  ...analysisPanelEn,
  ...annotateAllEn,
  ...annotateSetEn,
  ...annotatedIfcEn,
  ...annotationsEn,
  ...anonymizedExportEn,
  ...appearanceAssignmentListEn,
  ...appearanceAssignmentMembersEn,
  ...appearancePanelEn,
  ...appearancePickersEn,
  ...appearanceWorkflowsEn,
  ...assistantArtifactsEn,
  ...assistantPackAutomationEn,
  ...assistantPackChecksEn,
  ...assistantPackCoordinationEn,
  ...assistantPackMeasureEn,
  ...assistantPackSiteEn,
  ...assistantPackTablesEn,
  ...assistantSourcesEn,
  ...assistantUsageEn,
  ...attributeEditorEn,
  ...automationEditorEn,
  ...bcfDraftsEn,
  ...bcfEn,
  ...boqEn,
  ...bulkPropertyEditorEn,
  ...cadLayersEn,
  ...catalogueEn,
  ...cesiumGeoEn,
  ...changeSetsEn,
  ...changesPanelEn,
  ...chartsEn,
  ...chatByokEn,
  ...chatEn,
  ...checkAuthoringEn,
  ...checkReadyEn,
  ...checkEn,
  ...civilDrawingsEn,
  ...civilEn,
  ...clashGroupApplyEn,
  ...clashGroupsEn,
  ...clashPanelEn,
  ...clashToolsEn,
  ...colourSchemeEn,
  ...commandPaletteEn,
  ...commandsEn,
  ...compareKeyPropertyEn,
  ...comparePanelEn,
  ...copyArrayEn,
  ...costPanelEn,
  ...curtainGridEn,
  ...cutawayAxoEn,
  ...dataConnectorEn,
  ...deviationStatsEn,
  ...documentMenuEn,
  ...documentEn,
  ...draftSetEn,
  ...draftingStandardsEn,
  ...draftingEn,
  ...drawingUnderlayEn,
  ...elementGraphicsEn,
  ...elementTypesEn,
  ...exportDialogEn,
  ...extensionsFlavorsEn,
  ...extensionsPanelsEn,
  ...extrusionInspectionEn,
  ...feedbackEn,
  ...filterGroupsEn,
  ...filterOperatorsEn,
  ...flowAssistantEn,
  ...flowPanelEn,
  ...flowStartupEn,
  ...ganttWorkCalendarEn,
  ...geometryExportDialogsEn,
  ...georeferencingEn,
  ...groupsEn,
  ...handoverEn,
  ...hierarchyEn,
  ...hostedPlaceEn,
  ...idsPanelEn,
  ...ifcsheetTourEn,
  ...ionUploadEn,
  ...issueChangesEn,
  ...issueEn,
  ...joineryEn,
  ...keyboardShortcutsEn,
  ...landXmlEn,
  ...layersPanelEn,
  ...lensPanelEn,
  ...listsEn,
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
