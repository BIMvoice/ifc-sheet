/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

/** The underlay panel of a drawing tab (#457): a PDF page or an image to trace over. The command's own prompts are in `drafting.en.ts`. */
export const underlayEn = {
  'underlay.open': 'Underlay',
  'underlay.title': 'Underlay',
  'underlay.hint': 'Lay a scanned PDF page or an image under this drawing and trace over it. Set the scale from a distance you know. The picture is kept in the project, reduced to at most 2 MB.',
  'underlay.page': 'PDF page',
  'underlay.add': 'Add a PDF page or an image',
  'underlay.importing': 'Reading the file...',
  'underlay.failed': 'The underlay could not be added: {reason}',
  'underlay.pageShort': 'page {page}',
  'underlay.remove': 'Remove',
  'underlay.scaleByPoints': 'Scale by two points',
  'underlay.scale': 'Scale (mm per pixel)',
  'underlay.x': 'Centre X (m)',
  'underlay.y': 'Centre Y (m)',
  'underlay.rotation': 'Rotation (degrees)',
  'underlay.opacity': 'Opacity',
  'underlay.lock': 'Lock position and scale',
  'underlay.printsHeading': 'Prints on sheet',
  'underlay.noSheets': 'This drawing is not on a sheet yet.',
} as const satisfies Record<string, TranslationValue>;
