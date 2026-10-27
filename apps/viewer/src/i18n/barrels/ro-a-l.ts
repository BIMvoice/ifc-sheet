/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { annotateAllRo } from '../catalogues/annotate-all.ro';
import { annotateSetRo } from '../catalogues/annotate-set.ro';
import { annotatedIfcRo } from '../catalogues/annotated-ifc.ro';
import { anonymizedExportRo } from '../catalogues/anonymized-export.ro';
import { appearancePickersRo } from '../catalogues/appearance-pickers.ro';
import { boqRo } from '../catalogues/boq.ro';
import { byggesaksbimRo } from '../catalogues/byggesaksbim.ro';
import { cadLayersRo } from '../catalogues/cad-layers.ro';
import { catalogueRo } from '../catalogues/catalogue.ro';
import { checkRo } from '../catalogues/check.ro';
import { classificationRo } from '../catalogues/classification.ro';
import { colourSchemeRo } from '../catalogues/colour-scheme.ro';
import { commandPaletteRo } from '../catalogues/command-palette.ro';
import { creditsRo } from '../catalogues/credits.ro';
import { cutawayAxoRo } from '../catalogues/cutaway-axo.ro';
import { documentRo } from '../catalogues/document.ro';
import { draftingRo } from '../catalogues/drafting.ro';
import { draftingStandardsRo } from '../catalogues/drafting-standards.ro';
import { elementGraphicsRo } from '../catalogues/element-graphics.ro';
import { joineryDraftRo } from '../catalogues/joinery-draft.ro';
import { exportChangesReviewRo } from '../catalogues/export-changes-review.ro';
import { exportDialogRo } from '../catalogues/export-dialog.ro';
import { exportToastsRo } from '../catalogues/export-toasts.ro';
import { faceRo } from '../catalogues/face.ro';
import { featuresRo } from '../catalogues/features.ro';
import { feedbackRo } from '../catalogues/feedback.ro';
import { geometryExportDialogsRo } from '../catalogues/geometry-export-dialogs.ro';
import { germanyRo } from '../catalogues/germany.ro';
import { handoverRo } from '../catalogues/handover.ro';
import { hierarchyRo } from '../catalogues/hierarchy.ro';
import { idsPanelRo } from '../catalogues/ids-panel.ro';
import { ionUploadRo } from '../catalogues/ion-upload.ro';
import { issueChangesRo } from '../catalogues/issue-changes.ro';
import { issueRo } from '../catalogues/issue.ro';
import { joineryRo } from '../catalogues/joinery.ro';
import { keyboardShortcutsRo } from '../catalogues/keyboard-shortcuts.ro';
import { joineryCellRo } from '../catalogues/joinery-cell.ro';
import { joineryHeadRo } from '../catalogues/joinery-head.ro';
import { landxmlRo } from '../catalogues/landxml.ro';
import { listScheduleRo } from '../catalogues/list-schedule.ro';

/** The catalogues whose file starts with `a` to `l` (#144): a sub-barrel keeps the barrel under the module-size limit, and adding a catalogue touches one of them. Static imports, so `TranslationKey` sees every key. */
export const roAL = {
  ...annotateAllRo,
  ...annotateSetRo,
  ...annotatedIfcRo,
  ...anonymizedExportRo,
  ...appearancePickersRo,
  ...boqRo,
  ...byggesaksbimRo,
  ...cadLayersRo,
  ...catalogueRo,
  ...checkRo,
  ...classificationRo,
  ...colourSchemeRo,
  ...commandPaletteRo,
  ...creditsRo,
  ...cutawayAxoRo,
  ...documentRo,
  ...draftingRo,
  ...draftingStandardsRo,
  ...elementGraphicsRo,
  ...joineryDraftRo,
  ...exportChangesReviewRo,
  ...exportDialogRo,
  ...exportToastsRo,
  ...faceRo,
  ...featuresRo,
  ...feedbackRo,
  ...geometryExportDialogsRo,
  ...germanyRo,
  ...handoverRo,
  ...hierarchyRo,
  ...idsPanelRo,
  ...ionUploadRo,
  ...issueChangesRo,
  ...issueRo,
  ...joineryRo,
  ...keyboardShortcutsRo,
  ...joineryCellRo,
  ...joineryHeadRo,
  ...landxmlRo,
  ...listScheduleRo,
} as const;
