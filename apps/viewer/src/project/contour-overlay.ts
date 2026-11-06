/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The height labels of a plan's major contours (#182) as an overlay, so the live view, a sheet viewport, the sheet's SVG and
 * PDF and the DXF carry them as they carry the grid. Where the labels stand and what they read is the engine's
 * (`layoutContourLabels`, the function the headless sheets call).
 */

import type { Drawing2D } from '@ifc-lite/drawing-2d';
import { layoutContourLabels } from '@bimvoice/ifcsheet';
import type { SheetLocale } from '@bimvoice/ifcsheet/names';
import type { PlanOverlay } from './plan-overlays';

/** The DXF layer of the labels. */
export const CONTOUR_LABEL_LAYER = 'CONTOUR-LABELS';

/** The labels of `drawing` at 1:`scale` as overlays (none when it has none). */
export function contourOverlays(drawing: Drawing2D | null | undefined, scale: number, locale: SheetLocale): PlanOverlay[] {
  if (!drawing) return [];
  const { texts } = layoutContourLabels(drawing, scale, locale);
  if (texts.length === 0) return [];
  return [{ layer: CONTOUR_LABEL_LAYER, width: 0.18, shapes: [], texts: texts.map((t) => ({ at: t.at, text: t.text, angle: t.angle })) }];
}
