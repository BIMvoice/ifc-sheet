/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { manualValidationEn } from '../catalogues/manual-validation.en';
import { materialsEn } from '../catalogues/materials.en';
import { norwayEn } from '../catalogues/norway.en';
import { onboardingEn } from '../catalogues/onboarding.en';
import { pacEn } from '../catalogues/pac.en';
import { mcpPlaygroundEn } from '../catalogues/mcp-playground.en';
import { mcpEn } from '../catalogues/mcp.en';
import { measureEn } from '../catalogues/measure.en';
import { measuredQuantitiesEn } from '../catalogues/measured-quantities.en';
import { mergeLayersBannerEn } from '../catalogues/merge-layers-banner.en';
import { miscPanelsAEn } from '../catalogues/misc-panels-a.en';
import { miscPanelsBEn } from '../catalogues/misc-panels-b.en';
import { modelAuthoringEn } from '../catalogues/model-authoring.en';
import { modelChangesEn } from '../catalogues/model-changes.en';
import { modelInspectorEn } from '../catalogues/model-inspector.en';
import { modelWorkspaceEn } from '../catalogues/model-workspace.en';
import { modelingCommandEn } from '../catalogues/modeling-command.en';
import { moveRotateEn } from '../catalogues/move-rotate.en';
import { multiSplitEn } from '../catalogues/multi-split.en';
import { mutationPermissionEn } from '../catalogues/mutation-permission.en';
import { namesEn } from '../catalogues/names.en';
import { newProjectEn } from '../catalogues/new-project.en';
import { panelNoModelEn } from '../catalogues/panel-no-model.en';
import { phasesEn } from '../catalogues/phases.en';
import { placementPanelEn } from '../catalogues/placement-panel.en';
import { planHandlesEn } from '../catalogues/plan-handles.en';
import { printPreviewEn } from '../catalogues/print-preview.en';
import { profileSectionEn } from '../catalogues/profile-section.en';
import { profilesEn } from '../catalogues/profiles.en';
import { projectNavigatorEn } from '../catalogues/project-navigator.en';
import { projectPackageEn } from '../catalogues/project-package.en';
import { projectVersionsEn } from '../catalogues/project-versions.en';
import { propertiesPanelEn } from '../catalogues/properties-panel.en';
import { propertiesSelectionEn } from '../catalogues/properties-selection.en';
import { propertiesEn } from '../catalogues/properties.en';
import { propertyEditorEn } from '../catalogues/property-editor.en';
import { pushPullAlignEn } from '../catalogues/push-pull-align.en';
import { relationshipCardEn } from '../catalogues/relationship-card.en';
import { relocateEn } from '../catalogues/relocate.en';
import { remeshEn } from '../catalogues/remesh.en';
import { repositionPanelEn } from '../catalogues/reposition-panel.en';
import { resultViewEn } from '../catalogues/result-view.en';
import { reviewEn } from '../catalogues/review.en';
import { revisionsEn } from '../catalogues/revisions.en';
import { ribbonToolbarEn } from '../catalogues/ribbon-toolbar.en';
import { roofBlockEn } from '../catalogues/roof-block.en';
import { roofEn } from '../catalogues/roof.en';
import { roomFinishesEn } from '../catalogues/room-finishes.en';
import { roomLayoutEn } from '../catalogues/room-layout.en';
import { roomScheduleEn } from '../catalogues/room-schedule.en';
import { roomSummaryEn } from '../catalogues/room-summary.en';
import { roomToolEn } from '../catalogues/room-tool.en';

/** The catalogues whose file starts with `m` to `r` (#144): a sub-barrel keeps the barrel under the module-size limit, and adding a catalogue touches one of them. Static imports, so `TranslationKey` sees every key. */
export const enMR = {
  ...manualValidationEn,
  ...materialsEn,
  ...mcpPlaygroundEn,
  ...mcpEn,
  ...measureEn,
  ...measuredQuantitiesEn,
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
  ...norwayEn,
  ...onboardingEn,
  ...pacEn,
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
  ...roomSummaryEn,
  ...roomToolEn,
} as const;
