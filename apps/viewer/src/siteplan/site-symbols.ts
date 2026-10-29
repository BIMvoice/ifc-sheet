/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What the app adds to the engine's placement of a site plan's north arrow and
 * scale bar (`@bimvoice/ifcsheet/site-marks`, one rule for the screen, the PDF
 * and the DXF): the labels of the coordinate points drafted on the view, which
 * only the app draws, so its marks keep clear of them too. Pure, paper mm.
 */

import type { Box } from '@bimvoice/ifcsheet/site-marks';
import { drawingToScreen, type SectionAxisName, type ViewTransform } from '@/drafting/frame';
import { annotationAtFactor } from '@/project/viewport-annotation';
import type { DraftEntity, Pt, SymbolInstanceShape } from '@/drafting/types';
import { COORDINATE_POINT_ID, type LiveSymbolContext } from './live-symbols';

/**
 * The paper box a coordinate point and its label take (`live-symbols.ts`
 * stacks the lines 2 mm high, 3 mm apart, from 3 mm right of the point), the
 * point at `p` on the paper, `k` paper mm per symbol mm.
 */
export function coordinateLabelBox(p: Pt, k: number, lines: readonly string[]): Box {
  const longest = Math.max(0, ...lines.map((l) => l.length));
  const n = Math.max(1, lines.length);
  return { x0: p.x - 2.5 * k, y0: p.y - (3 + 3 * (n - 1)) * k, x1: p.x + (3 + longest * 2 * 0.62) * k, y1: p.y + 2.5 * k };
}

/** The boxes of the coordinate labels the view's drafts show (a layer that is off shows none), as drawn at `factor`. */
export function coordinateLabels(
  drafts: readonly DraftEntity[], factor: number, t: ViewTransform, axis: SectionAxisName, live: LiveSymbolContext, layerColor: ReadonlyMap<string, string | null>,
): Box[] {
  return drafts.flatMap((e): Box[] => {
    const shown = e.shape.type === 'symbol' && layerColor.get(e.layerId) !== null ? annotationAtFactor(e.shape, factor) : null;
    if (shown?.type !== 'symbol' || (shown as SymbolInstanceShape).symbolId !== COORDINATE_POINT_ID) return [];
    return [coordinateLabelBox(drawingToScreen(shown.p, t, axis), shown.scale * t.scale, live.coordinates?.(shown.p) ?? [])];
  });
}
