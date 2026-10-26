/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { aiReportsEn } from '../catalogues/ai-reports.en';
import { alignmentSectionEn } from '../catalogues/alignment-section.en';
import { analysisPanelEn } from '../catalogues/analysis-panel.en';
import { annotateAllEn } from '../catalogues/annotate-all.en';
import { annotateSetEn } from '../catalogues/annotate-set.en';
import { annotatedIfcEn } from '../catalogues/annotated-ifc.en';
import { annotationsEn } from '../catalogues/annotations.en';
import { anonymizedExportEn } from '../catalogues/anonymized-export.en';
import { appearanceAssignmentListEn } from '../catalogues/appearance-assignment-list.en';
import { appearanceAssignmentMembersEn } from '../catalogues/appearance-assignment-members.en';
import { appearancePanelEn } from '../catalogues/appearance-panel.en';
import { appearancePickersEn } from '../catalogues/appearance-pickers.en';
import { appearanceWorkflowsEn } from '../catalogues/appearance-workflows.en';
import { assistantArtifactsEn } from '../catalogues/assistant-artifacts.en';
import { assistantPackAutomationEn } from '../catalogues/assistant-pack-automation.en';
import { assistantPackChecksEn } from '../catalogues/assistant-pack-checks.en';
import { assistantPackCoordinationEn } from '../catalogues/assistant-pack-coordination.en';
import { assistantPackMeasureEn } from '../catalogues/assistant-pack-measure.en';
import { assistantPackSiteEn } from '../catalogues/assistant-pack-site.en';
import { assistantPackTablesEn } from '../catalogues/assistant-pack-tables.en';
import { assistantSourcesEn } from '../catalogues/assistant-sources.en';
import { assistantUsageEn } from '../catalogues/assistant-usage.en';
import { attributeEditorEn } from '../catalogues/attribute-editor.en';
import { automationEditorEn } from '../catalogues/automation-editor.en';
import { bcfDraftsEn } from '../catalogues/bcf-drafts.en';
import { bcfEn } from '../catalogues/bcf.en';
import { boqEn } from '../catalogues/boq.en';
import { bulkPropertyEditorEn } from '../catalogues/bulk-property-editor.en';
import { cadLayersEn } from '../catalogues/cad-layers.en';
import { catalogueEn } from '../catalogues/catalogue.en';
import { cesiumGeoEn } from '../catalogues/cesium-geo.en';
import { changeSetsEn } from '../catalogues/change-sets.en';
import { changesPanelEn } from '../catalogues/changes-panel.en';
import { chartsEn } from '../catalogues/charts.en';
import { chatByokEn } from '../catalogues/chat-byok.en';
import { chatEn } from '../catalogues/chat.en';
import { checkAuthoringEn } from '../catalogues/check-authoring.en';
import { checkReadyEn } from '../catalogues/check-ready.en';
import { checkEn } from '../catalogues/check.en';
import { civilDrawingsEn } from '../catalogues/civil-drawings.en';
import { civilEn } from '../catalogues/civil.en';
import { clashGroupApplyEn } from '../catalogues/clash-group-apply.en';
import { clashGroupsEn } from '../catalogues/clash-groups.en';
import { clashPanelEn } from '../catalogues/clash-panel.en';
import { clashToolsEn } from '../catalogues/clash-tools.en';
import { classificationEn } from '../catalogues/classification.en';
import { colourSchemeEn } from '../catalogues/colour-scheme.en';
import { commandPaletteEn } from '../catalogues/command-palette.en';
import { commandsEn } from '../catalogues/commands.en';
import { compareKeyPropertyEn } from '../catalogues/compare-key-property.en';
import { comparePanelEn } from '../catalogues/compare-panel.en';
import { copyArrayEn } from '../catalogues/copy-array.en';
import { costPanelEn } from '../catalogues/cost-panel.en';
import { curtainGridEn } from '../catalogues/curtain-grid.en';
import { cutawayAxoEn } from '../catalogues/cutaway-axo.en';
import { dataConnectorEn } from '../catalogues/data-connector.en';
import { deviationStatsEn } from '../catalogues/deviation-stats.en';
import { documentMenuEn } from '../catalogues/document-menu.en';
import { documentEn } from '../catalogues/document.en';
import { creditsEn } from '../catalogues/credits.en';
import { draftSetEn } from '../catalogues/draft-set.en';
import { draftingStandardsEn } from '../catalogues/drafting-standards.en';
import { draftingEn } from '../catalogues/drafting.en';
import { drawingUnderlayEn } from '../catalogues/drawing-underlay.en';
import { elementGraphicsEn } from '../catalogues/element-graphics.en';
import { elementTypesEn } from '../catalogues/element-types.en';
import { exportDialogEn } from '../catalogues/export-dialog.en';
import { extensionsFlavorsEn } from '../catalogues/extensions-flavors.en';
import { extensionsPanelsEn } from '../catalogues/extensions-panels.en';
import { extrusionInspectionEn } from '../catalogues/extrusion-inspection.en';

/** The catalogues whose file starts with `a` to `e` (#144): a sub-barrel keeps the barrel under the module-size limit, and adding a catalogue touches one of them. Static imports, so `TranslationKey` sees every key. */
export const enAE = {
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
  ...classificationEn,
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
  ...creditsEn,
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
} as const;
