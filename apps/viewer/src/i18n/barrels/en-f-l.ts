/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { feedbackEn } from '../catalogues/feedback.en';
import { filterGroupsEn } from '../catalogues/filter-groups.en';
import { filterOperatorsEn } from '../catalogues/filter-operators.en';
import { flowAssistantEn } from '../catalogues/flow-assistant.en';
import { flowPanelEn } from '../catalogues/flow-panel.en';
import { flowStartupEn } from '../catalogues/flow-startup.en';
import { ganttWorkCalendarEn } from '../catalogues/gantt-work-calendar.en';
import { geometryExportDialogsEn } from '../catalogues/geometry-export-dialogs.en';
import { georeferencingEn } from '../catalogues/georeferencing.en';
import { groupsEn } from '../catalogues/groups.en';
import { handoverEn } from '../catalogues/handover.en';
import { hierarchyEn } from '../catalogues/hierarchy.en';
import { hostedPlaceEn } from '../catalogues/hosted-place.en';
import { idsPanelEn } from '../catalogues/ids-panel.en';
import { ifcsheetTourEn } from '../catalogues/ifcsheet-tour.en';
import { ionUploadEn } from '../catalogues/ion-upload.en';
import { issueChangesEn } from '../catalogues/issue-changes.en';
import { issueEn } from '../catalogues/issue.en';
import { joineryEn } from '../catalogues/joinery.en';
import { keyboardShortcutsEn } from '../catalogues/keyboard-shortcuts.en';
import { landXmlEn } from '../catalogues/landxml.en';
import { layersPanelEn } from '../catalogues/layers-panel.en';
import { lensPanelEn } from '../catalogues/lens-panel.en';
import { listScheduleEn } from '../catalogues/list-schedule.en';
import { listsEn } from '../catalogues/lists.en';

/** The catalogues whose file starts with `f` to `l` (#144): a sub-barrel keeps the barrel under the module-size limit, and adding a catalogue touches one of them. Static imports, so `TranslationKey` sees every key. */
export const enFL = {
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
  ...listScheduleEn,
  ...listsEn,
} as const;
