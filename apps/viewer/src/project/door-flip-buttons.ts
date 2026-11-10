/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Where the flip buttons of a selected door go on a plan (#679). The buttons call the same actions as the element's graphics bar
 * (`flipOnDrawing`, #491), so the per-view flips they write are the bar's and undo, the sheet, PDF and DXF follow. Only a door that
 * the plan draws and that is selected gets buttons: a window (an untyped one is symmetric) or no selection gets none.
 */

import { arcPoints } from '@bimvoice/ifcsheet';
import { drawingToScreen, type SectionAxisName, type ViewTransform } from '@/drafting/frame';
import type { DraftShape, Pt } from '@/drafting/types';
import { symbolShapes, type OpeningSymbol } from '@/drafting/opening-symbols';
import { renderIdGlobalId } from './element-guid';

export interface DoorFlipPlacement {
  /** The door's GlobalId, what `flipOnDrawing` takes. */
  globalId: string;
  /** Screen position (px) of the top-left of the button group: just right of the door symbol's box. */
  left: number;
  top: number;
}

const GAP = 6;

function shapePoints(s: DraftShape): Pt[] {
  switch (s.type) {
    case 'line': return [s.a, s.b];
    case 'polyline': return s.pts;
    case 'circle': return arcPoints(s.c, s.r, 0, Math.PI * 2);
    case 'arc': return arcPoints(s.c, s.r, s.start, s.end);
  }
}

/** One placement per selected door symbol; `selectedRenderIds` are the renderer ids of the selection. */
export function doorFlipPlacements(
  symbols: readonly OpeningSymbol[], selectedRenderIds: ReadonlySet<number>, transform: ViewTransform, axis: SectionAxisName,
): DoorFlipPlacement[] {
  const out: DoorFlipPlacement[] = [];
  for (const s of symbols) {
    if (s.kind !== 'door' || !selectedRenderIds.has(s.id)) continue;
    const globalId = renderIdGlobalId(s.id);
    if (!globalId) continue;
    const pts = symbolShapes(s).flatMap(shapePoints).map((p) => drawingToScreen(p, transform, axis));
    if (pts.length === 0) continue;
    out.push({ globalId, left: Math.max(...pts.map((p) => p.x)) + GAP, top: Math.min(...pts.map((p) => p.y)) });
  }
  return out;
}
