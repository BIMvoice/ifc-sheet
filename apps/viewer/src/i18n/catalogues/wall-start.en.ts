/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The start page: what the app makes from an IFC file, and the ways in. */
export const wallStartEn = {
  'wall.start.eyebrow': 'IFC in, drawings out',
  'wall.start.titleStart': 'Drawings from',
  'wall.start.titleEnd': 'your IFC model.',
  'wall.start.body': 'Open one or more IFC files, such as architecture and structure together, and their plans, elevations and sections are laid out on sheets, with the title block filled in from the model, ready to issue as PDF.',
  'wall.start.drop': 'Drop one or more IFC files here',
  'wall.start.dropNow': 'Let go to open them',
  'wall.start.choose': 'Choose IFC files',
  'wall.start.notIfc': '{name} is not an IFC file. IfcSheet draws from IFC: {formats}.',
  'wall.start.templates': 'Have an office or permit set template?',
  'wall.start.previewOpen': 'Open the demo project this sheet comes from',
  'wall.start.previewAlt': 'Sheet A-101: two floor plans at 1:100 with room names, areas, dimensions and a title block',
  'wall.start.previewCaption': 'Sheet A-101 of the demo project, a block of flats, drawn and annotated by IfcSheet from its IFC file.',
} as const satisfies Record<string, TranslationValue>;
