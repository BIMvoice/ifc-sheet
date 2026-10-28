/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { RO_ONLY_CAPTIONS_EN } from '@bimvoice/ifcsheet';
import type { TranslationValue } from '../types';

/** The Romanian-practice title block (#54): its field captions and the way to choose its layout. */
export const titleBlockRoEn = {
  // The captions are the engine's (`title-block-ro.ts`): the layout is built there.
  ...RO_ONLY_CAPTIONS_EN,
  'tblayout.useRo': 'Use the Romanian layout',
  'tblayout.roHint': 'The cartuș of Ordinul 975/2026 (model F_01): firm and registration number, phase, project and sheet numbers, the roles that sign with their titles and an empty signature box each, and the verifier\'s requirement and report. It replaces the layout shown now (undo brings it back) and stays editable.',
  'tblayout.import': 'Import a DXF or SVG title block',
  'tblayout.import.label': 'Title block file (DXF or SVG)',
  'tblayout.import.hint': 'The lines and fixed text of your own title block become this layout, at true size from the DXF\'s units (millimetres when it states none), shrunk only if larger than 180 x 50 mm. An SVG is read from its lines, rectangles, paths and text; CSS, transforms and curves are not. Then place the fields on it below.',
  'tblayout.import.refused': 'Not imported: {reason}',
  'tblayout.field.pick': 'Title block field to place',
  'tblayout.field.place': 'Place the field',
  'tblayout.pack.save': 'Save as a library item (.bvlib)',
  'tblayout.pack.name': 'Own title block',
  'wall.tb.projectManagerTitle': 'Project manager: professional title',
  'wall.tb.designerTitle': 'Designed by: professional title',
  'wall.tb.drawnByTitle': 'Drawn by: professional title',
  'wall.tb.verifierCapacity': 'Verifier / expert: capacity',
  'wall.tb.phaseHint': 'e.g. PAC, PTh, DE (DTAC is the old name of PAC)',
} as const satisfies Record<string, TranslationValue>;
