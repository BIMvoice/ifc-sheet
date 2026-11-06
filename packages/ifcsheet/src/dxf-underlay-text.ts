/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The text of a DXF underlay (#547): TEXT and MTEXT (the converter has stripped the MTEXT codes), in the underlay's frame like its lines.
 * A text is anchored on its baseline (the converter's vertical justification is turned into that shift here), so every writer draws it alike.
 */

import type { Point2D } from '@ifc-lite/drawing-2d';

/** One text of a converted DXF (`DxfUnderlayText` of `@ifc-lite/drawing-2d`): world plan metres, +y north. */
export interface ConvertedDxfText {
  position: Point2D;
  text: string;
  /** Cap height, metres. */
  height: number;
  dirX: number;
  dirY: number;
  align: 'left' | 'center' | 'right';
  valign: 'baseline' | 'bottom' | 'middle' | 'top';
}

export interface DxfLabel {
  /** Where the baseline starts (or its middle or end, per `align`), in the underlay's frame (y runs down). */
  at: Point2D;
  text: string;
  /** Cap height, metres. */
  height: number;
  /** Unit vector along the baseline, in the underlay's frame. */
  dir: Point2D;
  align: 'left' | 'center' | 'right';
}

/** The labels of a converted layer: y flipped once, vertical justification moved onto the baseline, texts with no height or no characters left out. */
export function labelsOfConverted(texts: readonly ConvertedDxfText[]): DxfLabel[] {
  const out: DxfLabel[] = [];
  for (const t of texts) {
    const text = t.text.replace(/\s+/g, ' ').trim();
    if (!text || !(t.height > 0) || ![t.position.x, t.position.y, t.dirX, t.dirY, t.height].every(Number.isFinite)) continue;
    // In the world frame (+y north) a text's up is its baseline turned a quarter; a top-anchored text starts one height above its baseline.
    const down = t.valign === 'top' ? t.height : t.valign === 'middle' ? t.height / 2 : 0;
    const x = t.position.x + t.dirY * down;
    const y = t.position.y - t.dirX * down;
    out.push({ at: { x, y: 0 - y }, text, height: t.height, dir: { x: t.dirX, y: 0 - t.dirY }, align: t.align });
  }
  return out;
}
