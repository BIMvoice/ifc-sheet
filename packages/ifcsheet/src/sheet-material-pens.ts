/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * What a cut's building materials add to a headless sheet beyond the band fills (#645): each hatch's strokes and the membrane lines,
 * as pens in the paint order of the app's sheet (`viewport-pens.ts`, `membrane-overlays.ts`). The bands themselves, the lines that go
 * and the hatches and membranes to draw come from `materialFaces`, the one function the app calls too. A hatch strokes in drawing
 * metres at the pattern's own size (`HATCH_UNIT_M`), as the app does, then maps to the paper. Solid patterns are not drawn here yet
 * (the band's fill carries the colour).
 */

import type { Point2D } from '@ifc-lite/drawing-2d';
import { clipPolyline } from './clip.js';
import { dashOf } from './draft-look.js';
import type { SheetPen } from './sheet-graphic.js';
import type { Rect } from './sheet-frame.js';
import { findPattern, HATCH_UNIT_M } from './hatch-library.js';
import { hatchSegments, type HatchPattern } from './hatch.js';
import type { MaterialFaces } from './material-drawing.js';
import type { PenTable, ViewStyler } from './view-style.js';

/** Strokes drawn for one band at most (the app's cap). */
const MAX_STROKES = 20000;
const INK = '#000000';
/** A membrane line is heavier than a cut line by this factor (`membrane-overlays.ts`). */
const MEMBRANE_HEAVIER = 1.4;

export function materialPens(faces: MaterialFaces, styler: ViewStyler, at: (p: Point2D) => Point2D, box: Rect, pens: PenTable, patterns: readonly HatchPattern[]): SheetPen[] {
  const out: SheetPen[] = [];
  const byWidth = new Map<number, SheetPen>();
  for (const h of faces.hatches) {
    // What the view hides has no hatch either.
    if (!styler.face({ entityId: h.entityId, ifcType: h.ifcType, materialId: h.materialId }).visible) continue;
    const pattern = findPattern(h.pattern, patterns);
    if (!pattern || pattern.solid) continue;
    const width = pens.materialHatch[h.pen];
    let pen = byWidth.get(width);
    if (!pen) {
      pen = { layer: 'HATCH', stroke: INK, width, fill: null, runs: [], regions: [] };
      byWidth.set(width, pen);
      out.push(pen);
    }
    const { segments } = hatchSegments(h.loops, pattern, { scale: h.scale * HATCH_UNIT_M, angleDeg: 0, maxSegments: MAX_STROKES });
    for (const s of segments) {
      const a = at(s.a);
      const b = at(s.b);
      // A dot (a zero-length stroke) is a speck a tenth of a millimetre long.
      for (const run of clipPolyline([a, a.x === b.x && a.y === b.y ? { x: b.x + 0.1, y: b.y } : b], box)) pen.runs.push(run);
    }
  }
  const lines = faces.membranes.flatMap((s) => (s.type === 'line' ? clipPolyline([at(s.a), at(s.b)], box) : []));
  if (lines.length > 0) out.push({ layer: 'MEMBRANE', stroke: INK, width: pens.pens.cut * MEMBRANE_HEAVIER, fill: null, dash: dashOf('dashed'), runs: lines, regions: [] });
  return out.filter((p) => p.runs.length > 0);
}
