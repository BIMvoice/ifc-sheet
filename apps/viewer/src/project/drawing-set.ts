/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/** Moved to the engine package (`packages/ifcsheet/src/drawing-set.ts`); re-exported here so the app's imports stay as they were. */

import type { TranslationKey } from '@/i18n';

export { PER_SHEET, SET_PAPER, SET_PAPERS, SET_SCALES, TARGET_SCALE, buildDrawingSet, choosePaper, detailedScaleThatFits, drawingArea, fitsScale, fittingScale, groundPlan, groupOfView, groupsThatDoNotFit, isSetSheet, overrun, placeViewports, scaleOn, sheetGroup, sheetScaleReason, sheetSeries, viewExtent, withViewHung } from '@bimvoice/ifcsheet';
export type { Arrangement, ModelExtent, SetGroup, SetInput, SheetLayout } from '@bimvoice/ifcsheet';

/** A sentence kept as data: a catalogue key and its parameters, translated where it is shown (any app key, wider than the engine's own scale reasons). */
export interface Reason {
  key: TranslationKey;
  params: Record<string, string | number>;
}
