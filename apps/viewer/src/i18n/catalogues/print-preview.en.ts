/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { TranslationValue } from '../types';

export const printPreviewEn = {
  'printPreview.open': 'Preview at paper size',
  'printPreview.title': 'Print preview: {number} {name}',
  'printPreview.close': 'Close preview',
  'printPreview.fit': 'Fit',
  'printPreview.actual': '100%',
  'printPreview.zoomIn': 'Zoom in',
  'printPreview.zoomOut': 'Zoom out',
  'printPreview.zoomLevel': '{percent}% of paper size',
  'printPreview.scaleNote': 'At 100% one millimetre of paper is one CSS millimetre. That is a true millimetre only on a screen calibrated for it: hold a ruler to a reference bar to check yours. The bars show only here; they are never printed.',
  'printPreview.paper': 'Paper {width} x {height} mm',
  'printPreview.bar': '1 m at 1:{scale}',
  'printPreview.barLength': '{mm} mm on paper',
  'printPreview.bars': 'Reference bars',
  'printPreview.warnings': 'Outside the drawing area',
  'printPreview.clean': 'Everything on the sheet is inside the drawing area.',
  'printPreview.item.viewport': '{name} (1:{scale})',
  'printPreview.item.draft': 'Draft {kind}',
  'printPreview.reason.frame': '{item} crosses the frame.',
  'printPreview.reason.titleBlock': '{item} overlaps the title block.',
  'printPreview.reason.area': '{item} is outside the drawing area.',
} as const satisfies Record<string, TranslationValue>;
