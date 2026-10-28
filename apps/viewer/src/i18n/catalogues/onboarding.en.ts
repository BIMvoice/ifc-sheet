/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/**
 * First-use hints, the "?" help menu and its how-to pages (#455). The how-to steps name the buttons as the
 * interface labels them today: when a label changes, change the step (`howto-pages.test.tsx` lists the labels each page relies on).
 */
export const onboardingEn = {
  'onboarding.hint.dismiss': 'Dismiss this hint',
  'onboarding.hint.viewportResize': 'Drag an edge or a corner of the chosen drawing to resize it.',
  'onboarding.hint.orthoOn': 'Ortho is on: the line stays horizontal or vertical. Press {key} to switch it off.',
  'onboarding.hint.orthoOff': 'Ortho is off. Press {key}, or hold Ctrl, to keep the line horizontal or vertical.',
  'onboarding.hint.openView': 'Double-click a drawing to draw in it.',
  'onboarding.hint.openSheet': 'Double-click a sheet to open it.',

  'onboarding.settings.title': 'Hints',
  'onboarding.settings.show': 'Show first-use hints',
  'onboarding.settings.showHint': 'One-line tips that appear where a feature applies, such as resizing a drawing. Turning this on brings back the ones you dismissed.',

  'onboarding.menu.label': 'Help',
  'onboarding.menu.shortcuts': 'Keyboard shortcuts',
  'onboarding.menu.howTo': 'How to',
  'onboarding.menu.report': 'Report a bug or suggest a feature',
  'onboarding.menu.tour': 'Tour of the Wall',
  'onboarding.menu.hints': 'Hints in Settings',

  'onboarding.howto.title': 'How to',
  'onboarding.howto.description': 'Short step-by-step guides for IfcSheet.',
  'onboarding.howto.back': 'All how-tos',

  'onboarding.howto.open.title': 'Open a model',
  'onboarding.howto.open.step1': 'In the top bar choose Open a model and pick an .ifc file. To try IfcSheet first, choose Demo project.',
  'onboarding.howto.open.step2': 'Wait while the model is read. It is read on your device.',
  'onboarding.howto.open.step3': 'The welcome page counts the storeys, the sheets and the views it made.',
  'onboarding.howto.open.step4': 'Choose Hang it on the wall to see the set.',
  'onboarding.howto.open.step5': 'To keep your work, choose Save the project in the top bar. Project, then Open, brings a saved project back.',

  'onboarding.howto.hang.title': 'Hang the set',
  'onboarding.howto.hang.step1': 'On the welcome page choose Hang it on the wall. The Wall shows every sheet side by side.',
  'onboarding.howto.hang.step2': 'Set the scale of the plans, the elevations and the sections with the 1 : 50, 1 : 100 and 1 : 200 buttons at the top.',
  'onboarding.howto.hang.step3': 'Double-click a sheet to open it. The Wall link above the sheet brings you back.',
  'onboarding.howto.hang.step4': 'In a sheet the wheel zooms and dragging the paper pans it.',
  'onboarding.howto.hang.step5': 'Click a drawing to choose it, drag it to move it, drag its edges or corners to resize it.',
  'onboarding.howto.hang.step6': 'Project in the top bar lists the sheets. + Sheet adds a new one.',

  'onboarding.howto.dimension.title': 'Dimension and tag',
  'onboarding.howto.dimension.step1': 'Double-click a plan sheet on the Wall to open it.',
  'onboarding.howto.dimension.step2': 'Choose Dimension in the column on the left.',
  'onboarding.howto.dimension.step3': 'Click two points; keep clicking and the chain continues. Every length is read from the model.',
  'onboarding.howto.dimension.step4': 'Press Esc, or choose Done, to stop.',
  'onboarding.howto.dimension.step5': 'Choose Tag, then click a door, a window or a room. The tag fills itself from the model.',

  'onboarding.howto.schedules.title': 'Schedules',
  'onboarding.howto.schedules.step1': 'Choose Project in the top bar.',
  'onboarding.howto.schedules.step2': 'Scroll to the buttons that start with a plus: + Door and window schedule, + Material takeoff, + Drawing register, + Quantities by type, + Room finishes, + Room and area schedule, + Legend.',
  'onboarding.howto.schedules.step3': 'Choose one. It is added as a new sheet and opens at once.',
  'onboarding.howto.schedules.step4': 'Its numbers are read from the model, so they follow it when the model changes.',
  'onboarding.howto.schedules.step5': 'Click the schedule to choose it: the panel on the right sets what it shows.',

  'onboarding.howto.titleBlock.title': 'Title block',
  'onboarding.howto.titleBlock.step1': 'Open a sheet and choose Title block at the top right of it.',
  'onboarding.howto.titleBlock.step2': 'Each field says where its value comes from: the model, or that it is not in the model.',
  'onboarding.howto.titleBlock.step3': 'Type a value into a field to give it for this sheet only.',
  'onboarding.howto.titleBlock.step4': 'For a value that goes on every sheet, set it once in the Project panel, in the title block section.',
  'onboarding.howto.titleBlock.step5': 'Edit the layout in the same section moves the lines and texts of the title block.',

  'onboarding.howto.export.title': 'Export',
  'onboarding.howto.export.step1': 'One sheet: open it and choose PDF or DXF at the top right.',
  'onboarding.howto.export.step2': 'Preview at paper size shows it as it will print.',
  'onboarding.howto.export.step3': 'The whole set: choose What is missing in the top bar first, to see what the sheets still lack.',
  'onboarding.howto.export.step4': 'Choose Issue the set and give the issue a name and a date.',
  'onboarding.howto.export.step5': 'Choose Issue as PDF, SVG, zipped or DXF, zipped. Drawing list (CSV) writes the list of sheets.',
} as const satisfies Record<string, TranslationValue>;
