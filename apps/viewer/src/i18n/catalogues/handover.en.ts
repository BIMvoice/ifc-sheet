/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { TranslationValue } from '../types';

/** The handover package (#83): the issued PDF, DXF, IFC, schedules and drawing list in one ZIP. Romanian: `handover.ro.ts`. */
export const handoverEn = {
  'handover.action': 'Hand over (ZIP)',
  'handover.hint': 'Issues the set as above and packs it with the IFC as loaded, every schedule as XLSX and the drawing list as XLSX. Drawings go as DXF; DWG follows with #52.',
  'handover.pattern': 'File name pattern',
  'handover.pattern.hint': 'Tokens: {tokens}. Names are plain ASCII, without slashes, at most 100 characters; two files with one name get (2).',
  'handover.pattern.example': 'Example: {name}',
  'handover.pattern.reset': 'Default',
  'handover.msg.done': 'Handover package: {count} files in {name}.',
  // Plain ASCII in every language, like `issue.file.drawingList`: the word in the zip's file name.
  'issue.file.handover': 'handover',
} as const satisfies Record<string, TranslationValue>;
